/**
 * Typed per-connection data for the chat example.
 * Demonstrates the documented `WebSocketData` module augmentation pattern:
 * extend the interface and `ws.data` becomes typed everywhere.
 */
declare module 'burger-api' {
    interface WebSocketData {
        userId?: string;
    }
}

// Makes this file a module so `declare module` augments (not shadows) the
// real `burger-api` package.
export {};
