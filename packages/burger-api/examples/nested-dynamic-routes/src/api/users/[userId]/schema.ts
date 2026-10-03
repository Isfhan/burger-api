import { z } from 'zod';

export const GET = {
    params: z.object({
        userId: z.string().min(1, 'User ID is required'),
    }),
};
