import http from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { toFetchHandler, setRequestIP } from 'burger-api';
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
 * Serves a burger-api app on plain Node.js: bridges `node:http` to the
 * app's Fetch handler and wires WebSocket routes automatically via the
 * `ws` package. Apps with no WebSocket routes get a plain HTTP server.
 *
 * Returns the underlying `http.Server` synchronously; `.listen()` runs
 * once route processing (and WebSocket wiring) is ready, so a request
 * can't arrive before the app is.
 *
 * @example
 * ```ts
 * import { serve } from '@burger-api/node-server';
 * import { Burger } from 'burger-api';
 *
 * const app = new Burger({ apiRoutes });
 * serve(app, { port: 3000 });
 * ```
 */
export function serve(app: Burger, options: ServeOptions = {}): Server {
    const fetchHandler = toFetchHandler(app);

    const server = http.createServer((req, res) => {
        void (async () => {
            try {
                const request = toWebRequest(req);
                // Expose the peer address as ctx.ip (native on Bun).
                if (req.socket.remoteAddress) {
                    setRequestIP(request, req.socket.remoteAddress);
                }
                const response = await fetchHandler(request);
                await sendWebResponse(res, response);
            } catch (err) {
                console.error('[@burger-api/node-server] request error:', err);
                if (!res.headersSent) res.statusCode = 500;
                res.end('Internal Server Error');
            }
        })();
    });

    // `fetchHandler()` lazily processes routes on first run. Trigger it
    // first so `createNodeWsBridge()` has what it needs, and so the server
    // doesn't listen before the app is ready.
    void app
        .fetchHandler()
        .then(() => {
            try {
                const bridge = app.createNodeWsBridge({ WebSocketServer });
                server.on('upgrade', (req, socket, head) => {
                    void bridge.handleUpgrade(req, socket, head);
                });
            } catch {
                // No WebSocket routes: createNodeWsBridge() throws. Expected.
            }
        })
        .finally(() => {
            server.listen(options.port ?? 3000, options.hostname);
        });

    return server;
}
