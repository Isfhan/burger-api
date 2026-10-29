# Changelog: @burger-api/node-server

## 0.1.0 (Unreleased)

First release: the official Node.js server for the new
[`burger-api@1.0.0-beta`](https://burger-api.com).

- `serve(app)` runs a burger-api app on `node:http`.
- WebSocket routes work automatically through the `ws` package.
- `ctx.ip` comes from the Node socket. Forwarded headers are never read.
- Every `Set-Cookie` header is kept, and `HEAD` responses never send a body.

**Requirements:** Node 24.22.1+ or 26.12.1+ and `burger-api` 1.0.0-beta or
later.

**Known limitation:** `ws.subscribe()`, `ws.publish()` and `ctx.publish()` use
Bun's pub/sub and throw on Node. Keep your own list of connections and send to
each one.
