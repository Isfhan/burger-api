import { z } from 'zod';

export const GET = {
    params: z.object({
        id: z.string().min(1, 'ID is required'),
    }),
};
