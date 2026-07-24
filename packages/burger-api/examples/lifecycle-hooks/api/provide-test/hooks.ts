import type { BurgerRequest } from '../../../../src/index';

// transform hook replaces the old `provide` hook.
// It decorates the context with values (session, user, tenant, etc.)
export const transform = {
    tenant: (req: BurgerRequest) => req.headers.get('X-Tenant') ?? 'global',
    user: (req: BurgerRequest) => {
        const r = req as unknown as Record<string, unknown>;
        return { name: 'alice', role: 'admin' };
    },
    role: (req: BurgerRequest) => {
        const r = req as unknown as Record<string, unknown>;
        return r.user !== undefined ? 'overridden-role' : 'guest';
    },
};
