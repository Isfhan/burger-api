/**
 * Typecheck-only fixture: user + ecosystem augmentations must compile
 * together, `RouteConfig.responseValidation` must exist, and `ws.user` must
 * share the `ctx.user` augmentation point. Compiled by
 * `test/types/typecheck-fixture.test.ts` via `tsc --noEmit`.
 */
import { Burger } from 'burger-api';
import type { BurgerContext, BurgerWS, RouteConfig } from 'burger-api';
import { basicAuth } from '../../../../../../ecosystem/plugins/basic-auth/basic-auth';

declare module 'burger-api' {
    // User-written augmentation: custom request-scoped property.
    interface BurgerContext {
        tenant: string;
    }
    // User-written augmentation: extra user field, shared by every auth
    // plugin through the same named interface.
    interface BurgerAuthUser {
        tenantId?: string;
    }
}

const config: RouteConfig = { responseValidation: 'off' };

const burger = new Burger({ apiRoutes: [] }).usePlugin(
    basicAuth({ validate: async () => ({ id: '1', username: 'u' }) })
);

const handler = (ctx: BurgerContext<{ query: unknown }>) => {
    const tenant: string = ctx.tenant;
    const tenantId: string | undefined = ctx.user?.tenantId;
    const username: string | undefined = ctx.user?.username;
    const mode: 'off' | 'dev' | 'enforce' | undefined =
        ctx.config?.responseValidation;
    return Response.json({ tenant, tenantId, username, mode });
};

const wsHandler = (ws: BurgerWS) => {
    const tenantId: string | undefined = ws.user?.tenantId;
    return tenantId;
};

export { burger, config, handler, wsHandler };
