import type { ContextField, RouteAccessInfo } from './types.js';

/**
 * Builds and freezes a `RouteAccessInfo` hint.
 *
 * The returned object is `Object.freeze`d so it can be shared safely across
 * requests. Its `has(field)` reports membership, treating `unknown: true` (the
 * conservative safe default) as "every field is used".
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
