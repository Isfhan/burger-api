import type { BurgerContext } from '../context/context.js';
import type { RequestHandler } from '../types/index.js';
import type { HookPlan, ResponseHook } from './types.js';
import { applyTransform } from './transform.js';
import { dispatchOnError } from './executor.js';
import { validateResponse } from '../validation/response.js';
import { isNotProductionEnv } from '../utils/env.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types.js';

/**
 * Capability probe: dynamic code generation (`new Function`) is forbidden
 * on several WinterCG runtimes — notably Cloudflare Workers
 * ("EvalError: Code generation from strings disallowed for this context").
 * Probed once per process; a negative result disables JIT globally and the
 * interpreter pipeline stays the permanent fallback.
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
 * True when `fn` is declared `async` (or is an async generator). Ported from
 * Elysia 2 (`compile/utils.js` `isAsyncFunction`) — an async-declared function
 * ALWAYS returns a promise, so its call site must await unconditionally.
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
 * Conservative source-level proof that `fn` can NEVER return a promise.
 * Ported from Elysia 2 (`compile/utils.js` `mayReturnPromise`, cached per
 * function). Only two shapes are proven safe:
 *
 * - a function/arrow **block body with no `return`** (any value-producing
 *   return would need the `return` token, so the call yields `undefined`), and
 * - an arrow with a **literal expression body** (`true`/`undefined`/…).
 *
 * Every other shape (including anything with a `return`, native code, or
 * unparseable source) reports `true` — "may return a promise" — so the
 * generated code keeps the thenable check and behavior can never drift.
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
 * `new Function`, unrolling the beforeRoute/response-hook chains that
 * `executeHookPlan` walks per request.
 *
 * Semantics contract (mirrors lifecycle/executor.ts exactly):
 *
 *   transform → validation → beforeRoute* → handler → response-validation?
 *   → afterRoute* → mapResponse*
 *   any throw → dispatchOnError (nearest-first onError chain)
 *
 * - **Sync-first**: a step that is not statically `async` is called without
 *   `await` when its source proves it cannot return a promise, and with a
 *   conditional `if (r != null && typeof r.then === 'function') r = await r`
 *   guard otherwise (Elysia 2 `awaitGuard`). The generated function only
 *   becomes `async` when some emitted call actually needs `await`; the error
 *   path always returns `dispatchOnError`'s promise.
 * - Forward hooks: `Response` short-circuits the remaining beforeRoute hooks
 *   and the handler (the response still flows through the collected
 *   mappers, response validation, afterRoute and mapResponse); a function
 *   return is an after-mapper applied in REVERSE collection order; anything
 *   else continues.
 * - Response hooks: `Response` replaces; `(res)=>Response` transforms.
 * - Cold/rare stages (transform, validation, response validation, error
 *   dispatch) delegate to the SAME shared functions the interpreter uses,
 *   so behavior cannot drift. Only hot chains are unrolled.
 * - Dependencies ride in one captured object `D`; no user function source
 *   is ever interpolated into the generated code.
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
    // Empty plan: nothing to unwrap or await — call the handler directly.
    // The caller's exit (Response check + `ctx.set` merge) is unchanged, and
    // no codegen is needed, so this works even where `new Function` is banned.
    // A plan carrying `onError` hooks is NOT empty here: this function owns
    // the error dispatch and must keep the try/catch wrapper.
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
        // Resolve the executor's env fallback NOW so the hot path reads one
        // boolean: explicit flag ?? NODE_ENV !== production.
        dbg: (debug ?? plan.debug) ?? isNotProductionEnv(),
    };

    const L: string[] = [];
    L.push('"use strict";');
    L.push('try{');

    // ---- sync-first call emission ----
    // The generated function is declared `async` only when at least one
    // emitted call site actually needs `await`.
    let needsAsync = false;
    /**
     * Emits `target = <call>` plus the await form its function demands:
     * unconditional for a statically-async fn, conditional (thenable guard)
     * for a fn that may return a promise, plain otherwise. `declare` prefixes
     * the assignment with `let` (the guard keeps using the bare name).
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
        // and the handler, but — exactly like `runHooks` — the mappers
        // collected so far still apply, and the response then continues
        // through response validation → afterRoute → mapResponse.
        //
        // A hook proven synchronous can only return `undefined`, so it never
        // contributes a mapper; when no hook can, the collection machinery
        // and its `await` loop disappear entirely.
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
                // Executor lowercases the method before schema lookup — an
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
                // Proven synchronous hook: only a Response replacement is
                // possible, so no mapper branch and no `await` are emitted.
                L.push(`if(${v} instanceof Response){res=${v};}`);
            }
        }
    };
    emitChain('a', aLen);
    emitChain('m', mLen);

    L.push('return res;');
    L.push('}catch(e){return DE(e,D.e,ctx,D.dbg,D.vc);}');

    const factory = new Function(
        'D',
        'TF',
        'VR',
        'DE',
        `return ${needsAsync ? 'async ' : ''}function(ctx,H,METHOD){${L.join('\n')}}`
    ) as (
        d: JitDeps,
        tf: typeof applyTransform,
        vr: typeof validateResponse,
        de: typeof dispatchOnError
    ) => (
        ctx: BurgerContext,
        handler: RequestHandler,
        method: string
    ) => Response | Promise<Response>;

    return factory(deps, applyTransform, validateResponse, dispatchOnError);
}
