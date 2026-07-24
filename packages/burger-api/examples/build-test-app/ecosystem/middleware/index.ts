/**
 * Middleware Re-exports
 *
 * Import middleware here and wire it in as `beforeRoute` hooks in
 * `api/hooks.ts` to apply it to every route. Example:
 *
 * ```typescript
 * // api/hooks.ts
 * import { cors } from './cors/cors';
 * import { logger } from './logger/logger';
 *
 * export const beforeRoute = [logger(), cors()];
 * ```
 */
