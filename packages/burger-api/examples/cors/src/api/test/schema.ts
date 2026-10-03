import { z } from 'zod';

export const POST = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        price: z.number().positive('Price must be positive'),
    }),
};
