# @burger-api/node-server

Run a [burger-api](https://burger-api.com) app on Node.js. One `serve(app)`
call starts a `node:http` server, and WebSocket routes work automatically.

## Install

```bash
npm install burger-api @burger-api/node-server
```

Requires Node 24.22.1+ (or 26.12.1+) and `burger-api` 1.0.0-beta or later.

## Usage

```ts
import { Burger } from 'burger-api';
import { serve } from '@burger-api/node-server';

const app = new Burger({
    apiRoutes: [
        {
            path: '/api/hello',
            handlers: { GET: () => Response.json({ message: 'Hello!' }) },
        },
    ],
});

const server = serve(app, { port: 3000 });
server.on('listening', () => {
    console.log('Server running on http://localhost:3000');
});
```

`serve()` returns the Node `http.Server` right away, so you can add your own
`'listening'` and `'error'` listeners. It only starts listening once the app is
ready, so no request arrives too early.

With the CLI, `burger-api build --target=node` builds a file-based project
for Node and uses this package for you.

## WebSocket

Add WebSocket routes to the same app. Nothing else changes:

```ts
const app = new Burger({
    apiRoutes,
    wsRoutes: [
        {
            path: '/chat',
            handlers: {
                open(ws) {
                    ws.sendText('connected');
                },
            },
        },
    ],
});

serve(app, { port: 3000 });
```

`ws.subscribe()`, `ws.publish()` and `ctx.publish()` use Bun's pub/sub, so they
throw on Node. Keep your own `Set` of connections and send to each one. See the
[WebSocket docs](https://burger-api.com/docs/websocket/overview#nodejs).

## `ctx.ip`

`ctx.ip` comes from the Node socket (`req.socket.remoteAddress`), the same as on
Bun. Forwarded headers are not read. Behind a proxy, see the rate-limiter
hook's `trustProxy` option.

## License

[MIT](https://github.com/isfhan/burger-api/blob/main/LICENSE)
