# @burger-api/node-server

The official Node.js adapter for [burger-api](https://burger-api.com) — one
`serve(app)` call bridges `node:http` to burger-api's Fetch-standard
handler, and wires WebSocket routes automatically when the app has any.

burger-api ships a Bun adapter and a WinterCG `toFetchHandler` for edge
runtimes, but nothing to run a real, long-lived server on plain Node. This
package is that missing piece — modeled directly on
[`@hono/node-server`](https://github.com/honojs/node-server)'s ergonomics.

## Install

```bash
npm install @burger-api/node-server
```

## Usage

```ts
import { serve } from "@burger-api/node-server";
import { Burger } from "burger-api";

const app = new Burger({
  apiRoutes: [
    {
      path: "/api/hello",
      handlers: { GET: () => Response.json({ message: "Hello!" }) },
    },
  ],
});

const server = serve(app, { port: 3000 });
server.on("listening", () => {
  console.log("Server running on http://localhost:3000");
});
```

`serve()` returns the underlying `http.Server` synchronously, so you can
attach your own `'listening'`/`'error'` listeners. `.listen()` itself isn't
called until route processing (and WebSocket bridge wiring, if applicable)
has finished — no window where a request could arrive before the app is
actually ready.

## WebSocket

Add `wsRoutes` (or `wsDir` / `app.websocket()`) to the same app — nothing
else changes:

```ts
const app = new Burger({
  apiRoutes,
  wsRoutes: [
    {
      path: "/chat",
      handlers: {
        open(ws) {
          ws.sendText("connected");
        },
      },
    },
  ],
});

serve(app, { port: 3000 }); // WebSocket bridge wired automatically
```

`ws.subscribe()`/`.publish()` (Bun's native pub/sub) are not available under
this adapter — they throw on every runtime except Bun. Use a plain
connection registry (a `Set`/`Map` you manage yourself) and fan out
messages manually; see burger-api's [WebSocket docs](https://burger-api.com/docs/websocket/overview#nodejs).

## Why not just `toFetchHandler` directly?

You can — `toFetchHandler(app)` from `burger-api` gives you a portable
`(request: Request) => Promise<Response>` that works on every WinterCG
runtime, Node included. This package exists because Node has no built-in way
to *feed* that function from a real socket: no native `fetch`-shaped server,
and no native WebSocket upgrade handling. `serve()` is that missing wiring,
done once, tested, so you don't hand-roll an `IncomingMessage`⇄`Request`
bridge yourself.

## License

MIT
