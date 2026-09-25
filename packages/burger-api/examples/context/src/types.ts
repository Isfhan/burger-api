/**
 * App-wide type extensions for BurgerAPI.
 * Route-level config options become typed on `ctx.config` for hooks
 * and handlers once the RouteConfig interface is augmented here.
 */
declare module 'burger-api' {
    interface RouteConfig {
        cache?: boolean;
        cacheMaxAge?: number;
        auth?: boolean;
        customSetting?: string;
    }
}