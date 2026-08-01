import type { Burger } from 'burger-api';

export default (burger: Burger) => {
    burger.provide('db', {
        users: [
            { id: 1, name: 'Alice', email: 'alice@example.com' },
            { id: 2, name: 'Bob', email: 'bob@example.com' },
        ],
        findById: async (id: number) => {
            const db = globalThis as any;
            return db._users?.find((u: any) => u.id === id) ?? null;
        },
    });

    burger.provide('logger', {
        info: (msg: string) => console.log(`[INFO] ${msg}`),
        warn: (msg: string) => console.warn(`[WARN] ${msg}`),
        error: (msg: string) => console.error(`[ERROR] ${msg}`),
    });
};
