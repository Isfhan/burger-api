import { z } from 'zod';
import { PaginationQuery, Item } from '../../schemas';

export const GET = {
    query: PaginationQuery,
    response: {
        '200': z.object({
            items: z.array(Item),
            page: z.number(),
            limit: z.number(),
            total: z.number(),
        }),
    },
};

export const POST = {
    coerce: true,
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        price: z.number().positive('Price must be positive'),
    }),
    response: {
        '201': Item,
    },
};
