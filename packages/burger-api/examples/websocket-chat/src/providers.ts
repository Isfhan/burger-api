import type { ProviderRegistrar } from 'burger-api';

export default (burger: ProviderRegistrar) => {
    burger.provide('logger', {
        info: (msg: string) => console.log(`[Logger] ${msg}`),
        warn: (msg: string) => console.warn(`[Logger] ${msg}`),
        error: (msg: string) => console.error(`[Logger] ${msg}`),
    });

    burger.provide('db', {
        saveMessage: async (data: any) => {
            console.log('[DB] Saving message:', data);
            return { id: Date.now(), ...data };
        },
        getRecentMessages: async (limit: number) => {
            return [];
        },
    });
};
