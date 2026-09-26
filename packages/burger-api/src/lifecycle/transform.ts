import type { BurgerContext } from '../context/context.js';
import type { TransformMap } from './types.js';
import { isThenable } from '../utils/thenable.js';

const RESERVED = new Set([
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
 * Applies `transform` factories onto a context instance.
 *
 * For each entry in the transform map, the factory is called with the context
 * and the result is shallow-assigned onto the context object. Reserved keys
 * (built-in properties like `params`, `query`, `body`, etc.) are silently
 * dropped with a `console.warn` in debug mode.
 *
 * This runs once per request, before validation and before `beforeRoute`.
 * Order: global `transform` entries are applied first, then route-level entries
 * (so route can reference or override global-transformed values).
 *
 * Sync-first: factories that return a plain value are assigned without an
 * `await` (no microtask). Only a factory that actually returned a thenable
 * switches to the async continuation.
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
