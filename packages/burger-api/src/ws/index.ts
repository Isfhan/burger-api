/**
 * WebSocket module for BurgerAPI
 */

export type {
    WebSocketData,
    WebSocketConfig,
    WebSocketRouteDefinition,
    WebSocketHandlers,
    WebSocketHooks,
    CompiledWebSocketRoute,
    BurgerWS,
    WebSocketModule,
    WebSocketHooksModule,
    WebSocketConfigModule,
} from './types.js';

export {
    WebSocketReadyState,
    WebSocketCloseCode,
    BurgerWSContext,
} from './types.js';

export { WebSocketScanner } from './scanner.js';
export type { ScannedWebSocketRoute, WebSocketScanResult } from './scanner.js';

export { WebSocketCompiler } from './compiler.js';

export { WebSocketRouter } from './router.js';

export { WebSocketAdapter } from './adapter.js';
export type { WebSocketAdapterOptions } from './adapter.js';
