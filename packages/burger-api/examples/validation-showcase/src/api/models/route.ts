import { z } from 'zod';
import type { BurgerContext } from 'burger-api';

// Model ref scenario (phase3 §9, §16.2): `query` references a named model by
// string. Resolved at compile time from ServerOptions.models; shares the
// compiled validator via the cache.
export const schema = {
    get: {
        query: 'Pagination',
    },
};

export function GET(ctx: BurgerContext) {
    return Response.json({ page: (ctx.validated!.query as any).page, limit: (ctx.validated!.query as any).limit });
}
