import type { BurgerRequest } from '../types/index';
import type { ProvideMap } from './types';

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
 * Applies `provide` factories onto a context instance.
 *
 * For each entry in the provide map, the factory is called with the request
 * and the result is shallow-assigned onto the context object. Reserved keys
 * (built-in properties like `params`, `query`, `body`, etc.) are silently
 * dropped with a `console.warn` in debug mode.
 *
 * This runs once per request, after `beforeHandle` and before the handler.
 * Order: global `provide` entries are applied first, then route-level entries
 * (so route can reference or override global-provided values).
 */
export function applyDerive(
    ctx: object,
    provideMap: ProvideMap,
    debug = false
): void {
    for (const key of Object.keys(provideMap)) {
        if (RESERVED.has(key)) {
            if (debug) {
                console.warn(
                    `[burger-api] provide key "${key}" is reserved — dropped`
                );
            }
            continue;
        }
        const value = provideMap[key](ctx as unknown as BurgerRequest);
        (ctx as Record<string, unknown>)[key] = value;
    }
}
