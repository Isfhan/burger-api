import type { BurgerRequest } from '../../../../src/index';

// mapResponse runs last and may mutate `ctx.set` to change the
// final response headers/status.
export const mapResponse = (req: BurgerRequest) => {
    const r = req as unknown as {
        set: { headers?: Record<string, string> };
    };
    r.set = r.set ?? {};
    r.set.headers = { ...(r.set.headers ?? {}), 'x-resp': '1' };
    return undefined;
};
