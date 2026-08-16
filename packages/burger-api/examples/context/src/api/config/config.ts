/**
 * Demonstrates the `RouteConfig` augmentation (defined in `src/types.ts`):
 * extend the interface there and `ctx.config` becomes typed for hooks
 * and handlers.
 */
import type { RouteConfig } from 'burger-api';

export default {
    cache: true,
    cacheMaxAge: 300,
    auth: false,
    customSetting: 'demo-value',
} satisfies RouteConfig;
