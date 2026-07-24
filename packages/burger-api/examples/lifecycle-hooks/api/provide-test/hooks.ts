import type { BurgerContext } from '../../../../src/index';

// transform hook replaces the old `provide` hook.
// It decorates the context with values (session, user, tenant, etc.)
export const transform = {
    tenant: (ctx: BurgerContext) => ctx.headers.get('X-Tenant') ?? 'global',
    user: (ctx: BurgerContext) => {
        const r = ctx as unknown as Record<string, unknown>;
        return { name: 'alice', role: 'admin' };
    },
    role: (ctx: BurgerContext) => {
        const r = ctx as unknown as Record<string, unknown>;
        return r.user !== undefined ? 'overridden-role' : 'guest';
    },
};
