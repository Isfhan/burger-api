import { cors } from '../../../../../ecosystem/hooks/cors/cors';

// Global hooks — apply to every request.
export const beforeRoute = [
    cors({
        origin: ['http://localhost:3000', 'https://hoppscotch.io'],
        debug: true,
    }),
];
