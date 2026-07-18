import { z } from 'zod';
import type { BurgerRequest } from 'burger-api';

// Response validation scenario (phase3 §8, §16.2). This example runs with
// `responseValidation: 'enforce'` app-wide, so a handler returning a body that
// violates the declared response schema fails with a safe 500 (no internals).
export const schema = {
    get: {
        // Correct contract — handler returns { ok: boolean }.
        response: { 200: z.object({ ok: z.boolean() }) },
    },
};

export function GET(_req: BurgerRequest) {
    return Response.json({ ok: true });
}
