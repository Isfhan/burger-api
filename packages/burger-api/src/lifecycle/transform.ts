import type { BurgerContext } from '../context/context';
import type { TransformMap } from './types';

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
 */
export async function applyTransform(
    ctx: BurgerContext,
    transformMap: TransformMap,
    debug = false
): Promise<void> {
    for (const key of Object.keys(transformMap)) {
        if (RESERVED.has(key)) {
            if (debug) {
                console.warn(
                    `[burger-api] transform key "${key}" is reserved — dropped`
                );
            }
            continue;
        }
        const value = await transformMap[key]!(ctx);
        (ctx as unknown as Record<string, unknown>)[key] = value;
    }
}
