import { z } from 'zod';
import type { BurgerRequest } from 'burger-api';

// Cookie slot (phase3 §5): validates parsed cookie *values* (signing is Phase 7).
export const schema = {
    get: {
        cookie: z.object({
            session: z.string().min(1),
        }),
    },
};

export function GET(req: BurgerRequest) {
    return Response.json({ session: req.validated.cookie!.session });
}
