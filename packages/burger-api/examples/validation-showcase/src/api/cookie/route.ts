import { z } from 'zod';
import type { BurgerContext } from 'burger-api';

// Cookie slot (phase3 §5): validates parsed cookie *values* (signing is Phase 7).
export const schema = {
    get: {
        cookie: z.object({
            session: z.string().min(1),
        }),
    },
};

export function GET(ctx: BurgerContext) {
    return Response.json({ session: (ctx.validated!.cookie as any).session });
}
