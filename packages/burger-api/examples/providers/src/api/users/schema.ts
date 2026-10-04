import { z } from 'zod';

export const GET = {
    query: z.object({
        limit: z.string().optional(),
    }),
};
