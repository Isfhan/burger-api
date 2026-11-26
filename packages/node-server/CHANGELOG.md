# Changelog: @burger-api/node-server

## Unreleased

### Fixes

- A request without a body now reaches the app with `request.body === null`,
  the same as on Bun. This covers POST, PUT, DELETE and OPTIONS with no
  `Content-Length` (or `Content-Length: 0`) and no `Transfer-Encoding`. Before,
  these requests had an empty body stream, so body-size-limiter answered
  `411 Length Required` to a bodiless POST, PUT or DELETE on Node. Requests
  with a sized or chunked body are unchanged.

## 0.1.1 (November 23, 2026)

### Security

- The `Host` header can no longer change which route runs. A request for
  `/public` with `Host: example.com/admin?` used to run the `/admin` route. The
  path now comes only from the request line, and an invalid `Host` gets `400`.

### Fixes

- When a client disconnects, `request.signal` aborts and the response stream
  stops, so an SSE route no longer keeps running.
- Absolute-form request targets (`GET http://host/path`) route correctly.

## 0.1.0 (November 2, 2026)

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
