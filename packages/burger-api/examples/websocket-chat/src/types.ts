/**
 * App-wide type extensions for BurgerAPI.
 * Typed per-connection data for the chat example: extend the WebSocketData
 * interface here and `ws.data` becomes typed everywhere.
 */
declare module 'burger-api' {
    interface WebSocketData {
        userId?: string;
    }
}
