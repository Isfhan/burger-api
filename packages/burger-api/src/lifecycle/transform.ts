import type { BurgerRequest } from '../types/index';
import type { TransformMap } from './types';

const RESERVED = new Set([
    'params',
    'wildcardParams',
    'query',
    'headers',
    'method',
    'url',
    'signal',
    'body',
    'bodyUsed',
    'validated',
    'set',
    'route',
    '_raw',
    '_ctxInit',
    '_query',
]);

/**
 * Applies `transform` factories onto a context instance.
 *
 * For each entry in the transform map, the factory is called with the request
 * and the result is shallow-assigned onto the context object. Reserved keys
 * (built-in properties like `params`, `query`, `body`, etc.) are silently
 * dropped with a `console.warn` in debug mode.
 *
 * This runs once per request, after `beforeRoute` and before the handler.
 * Order: global `transform` entries are applied first, then route-level entries
 * (so route can reference or override global-transformed values).
 */
export function applyTransform(
    ctx: object,
    transformMap: TransformMap,
    debug = false
): void {
    for (const key of Object.keys(transformMap)) {
        if (RESERVED.has(key)) {
            if (debug) {
                console.warn(
                    `[burger-api] transform key "${key}" is reserved — dropped`
                );
            }
            continue;
        }
        const value = transformMap[key](ctx as unknown as BurgerRequest);
        (ctx as Record<string, unknown>)[key] = value;
    }
}
