import { cors } from '../../../../ecosystem/hooks/cors/cors';

// Global hooks — apply to every request.
// This file lives at the app root (sibling of index.ts), NOT inside api/.
export const beforeHandle = [
    cors({
        origin: ['http://localhost:3000', 'https://hoppscotch.io'],
        debug: true,
    }),
];
