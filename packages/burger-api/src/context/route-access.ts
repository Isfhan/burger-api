import type { ContextField, RouteAccessInfo } from './types.js';

/**
 * Builds and freezes a `RouteAccessInfo` hint. Frozen so it can be shared
 * across requests; `unknown: true` (the safe default) makes `has()` report
 * every field as used.
 */
export function freezeRouteAccessInfo(
    fields: Iterable<ContextField>,
    unknown = false,
    hooks?: Iterable<string>
): RouteAccessInfo {
    const access = new Set<ContextField>(fields);
    const hookSet = new Set<string>(hooks ?? []);
    const info: RouteAccessInfo = {
        access,
        unknown,
        hooks: hookSet,
        has(field: ContextField): boolean {
            return unknown || access.has(field);
        },
    };
    return Object.freeze(info);
}
