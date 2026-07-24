import { z } from 'zod';
import type { BurgerContext } from 'burger-api';

// Coercion scenario (phase3 §7, §16.2): query strings are always strings;
// with `coerce: true` (app-wide in this example) `"42"` → 42, `"true"` → true.
export const schema = {
    get: {
        query: z.object({
            n: z.number(),
            b: z.boolean(),
            name: z.string().optional(),
        }),
    },
};

export function GET(ctx: BurgerContext) {
    const q = (ctx.validated!.query as any);
    return Response.json({ n: q.n, b: q.b, typeN: typeof q.n, typeB: typeof q.b });
}
