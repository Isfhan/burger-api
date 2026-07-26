import { Burger } from 'burger-api';

// Mock services for demonstration
const loggerService = {
    info: (msg: string) => console.log(`[Logger] ${msg}`),
    warn: (msg: string) => console.warn(`[Logger] ${msg}`),
    error: (msg: string) => console.error(`[Logger] ${msg}`),
};

const dbService = {
    saveMessage: async (data: any) => {
        console.log('[DB] Saving message:', data);
        return { id: Date.now(), ...data };
    },
    getRecentMessages: async (limit: number) => {
        return [];
    },
};

const burger = new Burger({
    wsDir: './src/websocket',
    debug: true,
});

// Register services (Phase 10: providers injection)
burger.provide('logger', loggerService);
burger.provide('db', dbService);

// Optional: Register auth plugin for protected routes
// import { jwtAuth } from 'burger-api/plugins/jwt-auth';
// burger.usePlugin(jwtAuth({ secret: process.env.JWT_SECRET }));

burger.serve(3000, () => {
    console.log('WebSocket chat server running at http://localhost:3000');
    console.log('Connect via WebSocket to ws://localhost:3000/chat');
    console.log('Services available: logger, db');
});
