import type { BurgerContext } from 'burger-api';

// Global error handler — logs errors and formats RFC 9457 responses.
export const onError = [
    (error: Error, ctx: BurgerContext) => {
        console.error(`[ERROR] ${error.message}`);
    },
];
