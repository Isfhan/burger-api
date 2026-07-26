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
} from './types';

export {
  WebSocketReadyState,
  WebSocketCloseCode,
  BurgerWSContext,
} from './types';

export { WebSocketScanner } from './scanner';
export type { ScannedWebSocketRoute, WebSocketScanResult } from './scanner';

export { WebSocketCompiler } from './compiler';

export { WebSocketRouter } from './router';

export { WebSocketAdapter } from './adapter';
export type { WebSocketAdapterOptions } from './adapter';
