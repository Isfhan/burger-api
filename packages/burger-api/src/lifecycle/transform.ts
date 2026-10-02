import { BurgerContext } from '../context/context.js';
import type { TransformMap } from './types.js';
import { isThenable } from '../utils/thenable.js';

const RESERVED = new Set([
    // Reserved for a future release (like `ctx.set.cookies`).
    'cache',
    'params',
    'wildcardParams',
    'query',
    'cookies',
    'headers',
    'method',
    'url',
    'signal',
    'body',
    'bodyUsed',
    'validated',
    'set',
    'route',
    'request',
    'services',
    'config',
    'ip',
    'env',
    'executionCtx',
    '_raw',
    '_ctxInit',
    '_query',
    '_cookies',
    // Never allow prototype-corrupting keys through to the context.
    '__proto__',
    'constructor',
    'prototype',
]);

/**
 * Keys a `transform` factory may never claim — built-ins plus prototype
 * hazards. Exported so the JIT compiler shares the exact same guard.
 */
export const TRANSFORM_RESERVED = RESERVED;

/**
 * Every name a transform may never claim: the full `BurgerContext` prototype
 * (getters, methods, delegated `Request` members) plus the reserved names
 * above. Built once at module load.
 */
const RESERVED_TRANSFORM_KEYS: ReadonlySet<string> = new Set([
    ...Object.getOwnPropertyNames(BurgerContext.prototype),
    ...RESERVED,
]);

/**
 * Validates transform keys at compile time. A reserved key would shadow a
 * context member, so it fails startup loud with the offending key instead of
 * corrupting `ctx` at request time.
 */
export function assertTransformKeys(
    transformMap: TransformMap | undefined,
    source: string
): void {
    if (!transformMap) return;
    for (const key of Object.keys(transformMap)) {
        if (RESERVED_TRANSFORM_KEYS.has(key)) {
            throw new Error(
                `[burger-api] transform key "${key}" (${source}) is reserved ` +
                    'by BurgerContext and would shadow a context member — rename it.'
            );
        }
    }
}

/**
 * Applies `transform` factories onto a context instance: each factory is
 * called with the context and its result shallow-assigned. Reserved keys
 * (built-ins plus prototype hazards) are dropped with a `console.warn` in
 * debug mode.
 *
 * Runs once per request, before validation and `beforeRoute`. Global entries
 * apply first, then route-level ones (so a route can override globals).
 *
 * Sync-first: a plain value is assigned without an `await`; only a thenable
 * result switches to the async continuation.
 */
export function applyTransform(
    ctx: BurgerContext,
    transformMap: TransformMap,
    debug = false
): void | Promise<void> {
    return runTransformFrom(ctx, transformMap, Object.keys(transformMap), 0, debug);
}

/** Continues {@link applyTransform} from the factory at `start`. */
function runTransformFrom(
    ctx: BurgerContext,
    transformMap: TransformMap,
    keys: string[],
    start: number,
    debug: boolean
): void | Promise<void> {
    for (let i = start; i < keys.length; i++) {
        const key = keys[i]!;
        if (RESERVED.has(key)) {
            if (debug) {
                console.warn(
                    `[burger-api] transform key "${key}" is reserved — dropped`
                );
            }
            continue;
        }
        const value = transformMap[key]!(ctx);
        if (isThenable(value)) {
            // Only the async path allocates a continuation.
            return Promise.resolve(value).then((resolved) => {
                (ctx as unknown as Record<string, unknown>)[key] = resolved;
                return runTransformFrom(ctx, transformMap, keys, i + 1, debug);
            });
        }
        (ctx as unknown as Record<string, unknown>)[key] = value;
    }
    return undefined;
}
