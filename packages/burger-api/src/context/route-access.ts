import type { ContextField, RouteAccessInfo } from './types';

/**
 * Builds and freezes a `RouteAccessInfo` hint.
 *
 * The returned object is `Object.freeze`d so it can be shared safely across
 * requests. Its `has(field)` reports membership, treating `unknown: true` (the
 * conservative safe default) as "every field is used".
 */
export function freezeRouteAccessInfo(
    fields: Iterable<ContextField>,
    unknown = false
): RouteAccessInfo {
    const access = new Set<ContextField>(fields);
    const info: RouteAccessInfo = {
        access,
        unknown,
        has(field: ContextField): boolean {
            return unknown || access.has(field);
        },
    };
    return Object.freeze(info);
}
