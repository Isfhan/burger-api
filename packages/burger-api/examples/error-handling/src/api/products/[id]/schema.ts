import { z } from 'zod';

export const GET = {
    params: z.object({
        id: z.preprocess((val) => {
            if (typeof val === 'string') {
                const parsed = parseInt(val, 10);
                return isNaN(parsed) ? 'string' : parsed;
            }
            return val;
        }, z.number().min(1, 'ID is required')),
    }),
    query: z.object({
        search: z.string().optional(),
    }),
};
