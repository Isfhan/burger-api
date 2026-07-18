import { z } from 'zod';
import type { BurgerRequest } from 'burger-api';

// Model ref scenario (phase3 §9, §16.2): `query` references a named model by
// string. Resolved at compile time from ServerOptions.models; shares the
// compiled validator via the cache.
export const schema = {
    get: {
        query: 'Pagination',
    },
};

export function GET(req: BurgerRequest) {
    return Response.json({ page: req.validated.query!.page, limit: req.validated.query!.limit });
}
