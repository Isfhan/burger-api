import type { BurgerContext } from '../context/context.js';
import type { RequestHandler } from '../types/index.js';
import type { HookPlan, ResponseHook } from './types.js';
import { applyTransform } from './transform.js';
import { dispatchOnError, globalErrorFinisher } from './executor.js';
import { validateResponse } from '../validation/response.js';
import { resolveDebug } from '../utils/env.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types.js';

/**
 * Capability probe: `new Function` is forbidden on several WinterCG runtimes
 * (Cloudflare Workers throws "Code generation from strings disallowed for
 * this context"). Probed once per process; a negative result disables JIT and
 * the interpreter pipeline stays the fallback.
 */
let jitCapability: boolean | null = null;

export function canUseJit(): boolean {
    if (jitCapability === null) {
        try {
            new Function('return 0')();
            jitCapability = true;
        } catch {
            jitCapability = false;
        }
    }
    return jitCapability;
}

/** Test seam: forget the cached probe result. */
export function resetJitProbe(): void {
    jitCapability = null;
}

/**
 * True when `fn` is declared `async` (or is an async generator). An
 * async-declared function always returns a promise, so its call site must
 * await unconditionally.
 */
export function isAsyncFunction(fn: unknown): boolean {
    if (typeof fn !== 'function') return false;
    const name = (fn as { constructor?: { name?: string } }).constructor?.name;
    return name === 'AsyncFunction' || name === 'AsyncGeneratorFunction';
}

const MAY_RETURN_PROMISE_CACHE = new WeakMap<object, boolean>();

const MATCH_ARROW = /^(?:[\w$]+|\([\w$\s,.[\]{}:]*\))\s*=>([\s\S]*)$/;
const MATCH_FUNCTION =
    /^(?:function(?:\s+[\w$]+)?|[\w$]+)\s*\([\w$\s,.[\]{}:]*\)\s*(\{[\s\S]*\})$/;
const MATCH_LITERAL =
    /^(?:true|false|null|undefined|-?\d+(?:\.\d+)?|'[^'\\]*'|"[^"\\]*")$/;

/**
 * Conservative source-level proof that `fn` can NEVER return a promise,
 * cached per function. Only two shapes are proven safe: a block body with no
 * `return` token (the call yields `undefined`) and an arrow with a literal
 * expression body. Everything else (a `return`, native code, unparseable
 * source) reports `true`, so the generated code keeps its thenable check and
 * behavior cannot drift.
 */
export function mayReturnPromise(fn: unknown): boolean {
    if (typeof fn !== 'function') return true;
    const cached = MAY_RETURN_PROMISE_CACHE.get(fn as object);
    if (cached !== undefined) return cached;

    let result = true;
    try {
        const literal = Function.prototype.toString.call(fn).trim();
        const arrow = MATCH_ARROW.exec(literal);
        const body = (
            arrow?.[1] ?? MATCH_FUNCTION.exec(literal)?.[1]
        )?.trimStart();
        const blockWithoutReturn =
            !!body &&
            body.startsWith('{') &&
            body.endsWith('}') &&
            !/\breturn\b/.test(body);
        const literalArrow = !!arrow && body !== undefined && MATCH_LITERAL.test(body);
        result =
            literal.includes('[native code]') ||
            !(blockWithoutReturn || literalArrow);
    } catch {
        result = true;
    }
    MAY_RETURN_PROMISE_CACHE.set(fn as object, result);
    return result;
}

interface JitDeps {
    /** transform map (applyTransform owns reserved-key guarding). */
    tf?: import('./types.js').TransformMap;
    /** framework validation hook */
    v?: import('./types.js').ForwardHook;
    b: import('./types.js').ForwardHook[];
    a: ResponseHook[];
    m: ResponseHook[];
    e: import('./types.js').ErrorHook[];
    /** response validators present? */
    rv?: CompiledRouteValidators;
    vc?: ValidatorConfig;
    dbg?: boolean;
}

/** A thenable guard emitted after a call whose result may be a promise. */
function thenableGuard(target: string): string {
    return (
        `if(${target}!=null&&typeof ${target}.then==='function')` +
        `{${target}=await ${target};}`
    );
}

/**
 * Compiles a frozen {@link HookPlan} into a single function via
 * `new Function`, unrolling the chains `executeHookPlan` walks per request.
 *
 * Semantics contract (same as lifecycle/executor.ts):
 *
 *   transform → validation → beforeRoute* → handler → response-validation?
 *   → afterRoute* → mapResponse*
 *   any throw → dispatchOnError (nearest-first onError chain)
 *
 * - Sync-first: a step proven not to return a promise is called without
 *   `await`; otherwise a conditional thenable guard is emitted. The generated
 *   function becomes `async` only when a call actually needs `await`; the
 *   error path always returns `dispatchOnError`'s promise.
 * - Forward hooks: `Response` short-circuits the remaining hooks and the
 *   handler (the response still flows through collected mappers, response
 *   validation, afterRoute and mapResponse); a function return is an
 *   after-mapper applied in reverse collection order.
 * - Response hooks: `Response` replaces; `(res)=>Response` transforms.
 * - Cold stages (transform, validation, response validation, error dispatch)
 *   delegate to the same shared functions the interpreter uses, so behavior
 *   cannot drift; only hot chains are unrolled.
 * - Dependencies ride in one captured object `D`; no user function source is
 *   ever interpolated into the generated code.
 *
 * @returns the compiled dispatcher, or `null` when there is nothing worth
 *          compiling or dynamic code generation is unavailable.
 */
export function compileJitHookPlan(
    plan: HookPlan,
    debug?: boolean,
    handler?: RequestHandler
): ((
    ctx: BurgerContext,
    handler: RequestHandler,
    method: string
) => Response | Promise<Response>) | null {
    // Empty plan: call the handler directly (works where `new Function` is
    // banned). A plan with onError hooks is not empty — this function owns the
    // error dispatch and keeps the try/catch wrapper.
    if (
        plan.onError.length === 0 &&
        plan.transform === undefined &&
        plan.validation === undefined &&
        plan.validators?.response === undefined &&
        plan.beforeRoute.length === 0 &&
        plan.afterRoute.length === 0 &&
        plan.mapResponse.length === 0
    ) {
        return (ctx, handler) => handler(ctx);
    }

    if (!canUseJit()) return null;

    const bLen = plan.beforeRoute.length;
    const aLen = plan.afterRoute.length;
    const mLen = plan.mapResponse.length;

    const deps: JitDeps = {
        tf: plan.transform,
        v: plan.validation,
        b: plan.beforeRoute,
        a: plan.afterRoute,
        m: plan.mapResponse,
        e: plan.onError,
        rv: plan.validators,
        vc: plan.validatorConfig,
        // Resolve the env fallback now so the hot path reads one boolean.
        dbg: resolveDebug(debug ?? plan.debug),
    };

    const L: string[] = [];
    L.push('"use strict";');
    L.push('try{');

    // ---- sync-first call emission ----
    // The generated function is declared `async` only when a call needs await.
    let needsAsync = false;
    /**
     * Emits `target = <call>` plus the await form the function demands:
     * unconditional for an async fn, conditional (thenable guard) when it may
     * return a promise, plain otherwise. `declare` prefixes with `let`.
     */
    const emitCall = (
        target: string,
        call: string,
        fn: unknown,
        declare = false
    ): void => {
        const assignment = declare ? `let ${target}` : target;
        if (isAsyncFunction(fn)) {
            L.push(`${assignment}=await ${call};`);
            needsAsync = true;
            return;
        }
        if (!mayReturnPromise(fn)) {
            L.push(`${assignment}=${call};`);
            return;
        }
        L.push(`${assignment}=${call};${thenableGuard(target)}`);
        needsAsync = true;
    };

    if (plan.transform) {
        L.push('let _tf=TF(ctx,D.tf,D.dbg===true);');
        if (isAsyncFunction(applyTransform)) {
            L.push('_tf=await _tf;');
            needsAsync = true;
        } else {
            L.push(thenableGuard('_tf'));
            needsAsync = true;
        }
    }
    if (plan.validation) {
        emitCall('_v', 'D.v(ctx)', plan.validation, true);
    }

    // ---- beforeRoute chain (unrolled, mapper collection in order) ----
    if (bLen === 0) {
        emitCall('res', 'H(ctx)', handler, true);
    } else {
        // A `Response` short-circuit skips the remaining beforeRoute hooks
        // and the handler, but the mappers collected so far still apply, and
        // the response continues through validation → afterRoute → mapResponse.
        // A hook proven synchronous can only return `undefined`, so it never
        // contributes a mapper; when no hook can, the collection machinery
        // disappears entirely.
        const canReturnMapper: boolean[] = [];
        let anyMapper = false;
        for (let i = 0; i < bLen; i++) {
            const hook = plan.beforeRoute[i];
            const may =
                isAsyncFunction(hook) || mayReturnPromise(hook);
            canReturnMapper.push(may);
            if (may) anyMapper = true;
        }
        L.push(
            anyMapper
                ? `const M=new Array(${bLen});let mc=0;let res;`
                : 'let res;'
        );
        L.push('sc:{');
        for (let i = 0; i < bLen; i++) {
            emitCall(`h${i}`, `D.b[${i}](ctx)`, plan.beforeRoute[i], true);
            L.push(`if(h${i} instanceof Response){res=h${i};break sc;}`);
            if (canReturnMapper[i]) {
                L.push(`if(typeof h${i}==='function'){M[mc++]=h${i};}`);
            }
        }
        emitCall('res', 'H(ctx)', handler);
        L.push('}');
        if (anyMapper) {
            L.push(
                `for(let i=mc-1;i>=0;i--){res=M[i](res);` +
                    `if(res!=null&&typeof res.then==='function'){res=await res;}}`
            );
            needsAsync = true;
        }
    }

    // ---- response validation (post-handler, pre-afterRoute; JSON only) ----
    if (plan.validators?.response) {
        L.push(
            'try{const ct=res.headers.get("content-type")??"";' +
                'if(ct.includes("application/json")){' +
                'const body=await res.clone().json();' +
                // The method is lowercased before schema lookup — an
                // uppercase key silently misses and skips enforcement.
                'const out=VR(D.rv,METHOD.toLowerCase(),res.status,body,' +
                'D.vc||{},D.dbg);' +
                'if(!out.ok&&out.errorResponse){res=out.errorResponse;} } }catch(_sv){}'
        );
        needsAsync = true;
    }

    // ---- afterRoute / mapResponse chains (unrolled) ----
    const emitChain = (key: 'a' | 'm', len: number): void => {
        for (let i = 0; i < len; i++) {
            const v = `c_${key}${i}`;
            const hooks =
                key === 'a' ? plan.afterRoute : plan.mapResponse;
            const hook = hooks[i];
            const may =
                isAsyncFunction(hook) || mayReturnPromise(hook);
            emitCall(v, `D.${key}[${i}](ctx)`, hook, true);
            if (may) {
                L.push(
                    `if(${v} instanceof Response){res=${v};}` +
                        `else if(typeof ${v}==='function'){res=${v}(res);` +
                        `if(res!=null&&typeof res.then==='function'){res=await res;}}`
                );
                needsAsync = true;
            } else {
                // Proven synchronous: only a Response replacement is possible.
                L.push(`if(${v} instanceof Response){res=${v};}`);
            }
        }
    };
    emitChain('a', aLen);
    emitChain('m', mLen);

    L.push('return res;');
    L.push(
        '}catch(e){return GR(DE(e,D.e,ctx,D.dbg,D.vc),ctx);}'
    );

    const factory = new Function(
        'D',
        'TF',
        'VR',
        'DE',
        'GR',
        `return ${needsAsync ? 'async ' : ''}function(ctx,H,METHOD){${L.join('\n')}}`
    ) as (
        d: JitDeps,
        tf: typeof applyTransform,
        vr: typeof validateResponse,
        de: typeof dispatchOnError,
        gr: (response: Promise<Response>, ctx: BurgerContext) => Promise<Response>
    ) => (
        ctx: BurgerContext,
        handler: RequestHandler,
        method: string
    ) => Response | Promise<Response>;

    return factory(
        deps,
        applyTransform,
        validateResponse,
        dispatchOnError,
        globalErrorFinisher(plan.globalResponse)
    );
}
