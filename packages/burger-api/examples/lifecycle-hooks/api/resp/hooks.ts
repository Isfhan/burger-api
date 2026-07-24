import type { BurgerContext } from '../../../../src/index';

// mapResponse runs last and may mutate `ctx.set` to change the
// final response headers/status.
export const mapResponse = (ctx: BurgerContext) => {
    const r = ctx as unknown as {
        set: { headers?: Record<string, string> };
    };
    r.set = r.set ?? {};
    r.set.headers = { ...(r.set.headers ?? {}), 'x-resp': '1' };
    return undefined;
};
