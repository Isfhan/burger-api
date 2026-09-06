import http from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { toFetchHandler } from 'burger-api';
import type { Burger } from 'burger-api';
import { sendWebResponse, toWebRequest } from './bridge.js';

export { toWebRequest, sendWebResponse } from './bridge.js';

export interface ServeOptions {
    /** Port to listen on. Defaults to `3000`. */
    port?: number;
    /** Hostname to bind to. Defaults to Node's own default (all interfaces). */
    hostname?: string;
}

/**
 * Serves a burger-api app on plain Node.js — the official adapter, so
 * consumers don't need to hand-write an `IncomingMessage`⇄`Request` bridge
 * or wire `createNodeWsBridge()` themselves.
 *
 * ```ts
 * import { serve } from '@burger-api/node-server';
 * import { Burger } from 'burger-api';
 *
 * const app = new Burger({ apiRoutes });
 * serve(app, { port: 3000 });
 * ```
 *
 * WebSocket routes (`wsRoutes`, `wsDir`, or `app.websocket()`) are wired
 * automatically via `createNodeWsBridge()` and the `ws` package — no
 * separate setup needed. Apps with no WebSocket routes configured just get
 * a plain HTTP server; nothing extra happens.
 *
 * Returns the underlying `http.Server` synchronously (so callers can
 * attach their own `'listening'`/`'error'` listeners), but `.listen()`
 * itself isn't called until route processing (and WebSocket bridge wiring,
 * if applicable) has finished — this closes the exact race that would
 * otherwise let a request arrive before the app is actually ready.
 */
export function serve(app: Burger, options: ServeOptions = {}): Server {
    const fetchHandler = toFetchHandler(app);

    const server = http.createServer((req, res) => {
        void (async () => {
            try {
                const request = toWebRequest(req);
                const response = await fetchHandler(request);
                await sendWebResponse(res, response);
            } catch (err) {
                console.error('[@burger-api/node-server] request error:', err);
                if (!res.headersSent) res.statusCode = 500;
                res.end('Internal Server Error');
            }
        })();
    });

    // `fetchHandler()` lazily processes routes (including WebSocket ones)
    // the first time it runs, with no per-request hook side effects — this
    // is the documented way to trigger that ahead of time, so
    // `createNodeWsBridge()` (which needs it already done) doesn't throw,
    // and so the server isn't `.listen()`-ing before it's actually ready.
    void app
        .fetchHandler()
        .then(() => {
            try {
                const bridge = app.createNodeWsBridge({ WebSocketServer });
                server.on('upgrade', (req, socket, head) => {
                    void bridge.handleUpgrade(req, socket, head);
                });
            } catch {
                // No WebSocket routes configured on this app — nothing to
                // bridge. createNodeWsBridge() throws in this case; that's
                // expected and not an error worth surfacing here.
            }
        })
        .finally(() => {
            server.listen(options.port ?? 3000, options.hostname);
        });

    return server;
}
