import { z } from 'zod';

/**
 * Shared schemas, imported by route schema.ts files. Plain TypeScript —
 * define once, reuse anywhere, fully typed.
 */
export const PaginationQuery = z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(10),
});

export const Item = z.object({
    id: z.number(),
    name: z.string(),
    price: z.number(),
});
