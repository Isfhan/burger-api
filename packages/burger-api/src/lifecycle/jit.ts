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

/**
 * Compiles a frozen {@link HookPlan} into a single async function via
 * `new Function`, unrolling the beforeRoute/response-hook chains that
 * `executeHookPlan` walks per request.
 *
 * Semantics contract (mirrors lifecycle/executor.ts exactly):
 *
 *   transform → validation → beforeRoute* → handler → response-validation?
 *   → afterRoute* → mapResponse*
 *   any throw → dispatchOnError (nearest-first onError chain)
 *
 * - Forward hooks: `Response` short-circuits; a function return is an
 *   after-mapper applied to the handler's response in REVERSE collection
 *   order; anything else continues.
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
    debug?: boolean
): ((ctx: BurgerContext, handler: RequestHandler, method: string) => Promise<Response>) | null {
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

    if (plan.transform) L.push('await TF(ctx,D.tf,D.dbg===true);');
    if (plan.validation) L.push('await D.v(ctx);');

    // ---- beforeRoute chain (unrolled, mapper collection in order) ----
    if (bLen === 0) {
        L.push('let res=await H(ctx);');
    } else {
        L.push(`const M=new Array(${bLen});let mc=0;`);
        for (let i = 0; i < bLen; i++) {
            L.push(`const h${i}=await D.b[${i}](ctx);`);
            L.push(`if(h${i} instanceof Response){return h${i};}`);
            L.push(`if(typeof h${i}==='function'){M[mc++]=h${i};}`);
        }
        L.push('let res=await H(ctx);');
        L.push('for(let i=mc-1;i>=0;i--){res=await M[i](res);}');
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
                'if(!out.ok&&out.errorResponse){return out.errorResponse;} } }catch(_sv){}'
        );
    }

    // ---- afterRoute / mapResponse chains (unrolled) ----
    const emitChain = (key: 'a' | 'm', len: number): void => {
        for (let i = 0; i < len; i++) {
            const v = `c_${key}${i}`;
            L.push(`const ${v}=await D.${key}[${i}](ctx);`);
            L.push(
                `if(${v} instanceof Response){res=${v};}` +
                    `else if(typeof ${v}==='function'){res=await ${v}(res);}`
            );
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
        `return async function(ctx,H,METHOD){${L.join('\n')}}`
    ) as (
        d: JitDeps,
        tf: typeof applyTransform,
        vr: typeof validateResponse,
        de: typeof dispatchOnError
    ) => (
        ctx: BurgerContext,
        handler: RequestHandler,
        method: string
    ) => Promise<Response>;

    return factory(deps, applyTransform, validateResponse, dispatchOnError);
}
