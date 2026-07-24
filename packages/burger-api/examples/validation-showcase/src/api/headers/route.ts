import { z } from 'zod';
import type { BurgerContext } from 'burger-api';

// Headers slot (phase3 §5, §16.2): declares required headers; missing header
// → 400 with a structured error body.
export const schema = {
    get: {
        headers: z.object({
            'x-api-key': z.string().min(1),
        }),
    },
};

export function GET(ctx: BurgerContext) {
    return Response.json({ key: (ctx.validated!.headers as any)['x-api-key'] });
}
