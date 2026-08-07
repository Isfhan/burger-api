/**
 * Route Hooks
 * 
 * Define lifecycle hooks in hooks.ts files. Example (api/hooks.ts):
 * 
 * import { cors } from './cors/cors';
 * import { logger } from './logger/logger';
 * 
 * export const beforeRoute = [
 * logger(),
 * cors(),
 * ];
 */

export const beforeRoute: unknown[] = [];
