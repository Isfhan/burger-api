## 📣 Release Notes - @burger-api/node-server

### Version 0.1.0

First release. The official Node.js adapter for burger-api, modeled on
`@hono/node-server`'s ergonomics — `serve(app)` bridges `node:http` to
`toFetchHandler`, and wires `createNodeWsBridge()` + the `ws` package
automatically when the app has WebSocket routes configured.

Extracted and hardened from a hand-built Node example (`node:http`⇄`Request`/
`Response` bridge, `createNodeWsBridge` wiring) verified end-to-end during
burger-api's 1.0.0-beta.1 release audit — real HTTP requests (GET/POST/
validation/404) and a real two-client WebSocket broadcast round-trip, both
against the compiled package running under plain Node, not Bun.

**Known limitations**
- `ws.subscribe()`/`.publish()` (Bun's native pub/sub) are not available
  through this adapter — they throw on every non-Bun runtime, Node included.
  Use a plain connection registry and fan out manually.
- Requires `burger-api` `>=1.0.0-beta.1`.
