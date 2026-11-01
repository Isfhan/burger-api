import { z } from 'zod';

export const GET = {
    query: z.object({
        limit: z.string().optional(),
    }),
};

export const POST = {
    body: z.object({
        name: z.string().min(1),
        price: z.number().positive(),
    }),
};
