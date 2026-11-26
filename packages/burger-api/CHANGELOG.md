# Changelog: burger-api

## Unreleased

### Security

- **Auth plugins check credentials before validation.** jwt-auth, api-key,
  basic-auth, session and oidc now authenticate in `transform` instead of
  `beforeRoute`. A request without valid credentials gets `401` even when its
  body or query is invalid. Before, it got `422` with the validation details,
  which told anonymous clients about the route's schema. `ctx.user`,
  `ctx.apiKey` and `ctx.session` are still set for your hooks and handlers.
  Update your copies with `burger-api add <name> --force`.

### Changes

- **`HTTPError` can carry response headers:**
  `new UnauthorizedError('...', { headers: { 'WWW-Authenticate': '...' } })`.
  Every `HTTPError` subclass takes the option. The error response keeps
  `Content-Type: application/problem+json`. The check also works when a
  plugin imports its own copy of `burger-api`.
- **OpenAPI:** a route body schema the converter cannot turn into JSON Schema
  now shows as a `requestBody` with `schema: {}`, instead of having no
  `requestBody` at all.
- **Ecosystem:** the logger, security-headers and compression READMEs now
  register the hook in `onRequest`, so it also covers `404`, `405`,
  validation errors and `onError` responses, and logs the final status.

## 1.0.0-beta.1 (November 23, 2026)

### Security

- **Errors:** a thrown error with a `status` of 500 or more that is not an
  `HTTPError` (for example a database or SDK error) no longer shows its
  message to clients in production. Your own `HTTPError` messages are
  unchanged.
- **Auth plugins:** `config.auth.roles` is now enforced by every auth plugin.
  basic-auth and oidc check the user's `roles`; api-key and session have no
  roles, so a route that lists roles answers `403`. jwt-auth no longer accepts
  a `roles` string that merely contains a role name. An empty `roles: []`
  means no role is required.

### Fixes

- **Bun and other runtimes agree:** a method a route does not define now gets
  `405` on Bun too, instead of falling through to a less specific route (for
  example a wildcard, or `/users/:id` for `/users/me`).
- **Trailing slash:** the slash is now removed before matching, so
  `/api/products/1/` reaches `/api/products/:id` even when a sibling `[...]`
  wildcard exists, and `/api/files/` gives an empty `wildcardParams` (`[]`)
  instead of `[""]`. Same on Bun and every other runtime.
- **`onError` for pages:** errors thrown by pages, assets and the docs routes
  now go through your global and plugin `onError` hooks, like API routes.
- **`ctx.set.status = 204` (or 205, 304):** the response body is dropped, so
  Node no longer crashes and Bun no longer sends a body.
- **HEAD and response validation:** HEAD requests follow the GET response
  schema, so `responseValidation: 'enforce'` applies to them too.
- **Params in `onRequest`:** response mappers returned by `onRequest` hooks see
  `ctx.params` and `ctx.wildcardParams` on Bun, as on other runtimes.
- **Malformed `%` escapes** in params decode the same on every runtime.
- **Concurrent startup:** calling `fetchHandler()` or `serve()` twice at once
  compiles routes once, instead of failing with a route collision.
- **Convention files that apply to nothing:** a folder with `hooks.ts`,
  `config.ts`, `schema.ts` or `openapi.ts` but no `route.ts` (for example a
  `(group)` folder) now prints a startup warning, because routes do not
  inherit from parent folders. WebSocket folders without `ws.ts` warn the
  same way.
- **Route names:** a route folder or path with characters that can never
  match a request (spaces, non-ASCII) fails at startup with a clear message,
  instead of silently returning 404.
- **WebSocket:**
  - On Cloudflare Workers, `open` handlers and `onOpen` hooks now run.
  - On Node, a malformed frame from a client no longer crashes the process,
    `ctx.ip` is set during the upgrade, and `maxPayloadLength` is applied.
  - On Node, a `close` handler receives the reason as a string, as on Bun.
  - A broken WebSocket route file, two folders that map to the same path,
    two dynamic folders at one level, and a named `[...slug]` folder now fail
    at startup.
  - `rooms/[id]/[...]` wildcard routes match.
  - `auth: true` requires a user, the same as `{ required: true }`.
  - Response mappers from plugin `beforeRoute` hooks apply to rejected upgrades.
- **Ecosystem hooks and plugins** (update copies with `burger-api add <name>
  --force`):
  - compression skips `text/event-stream` (SSE no longer hangs),
    `Cache-Control: no-transform` and `206` responses.
  - compression, cors and cache add to the `Vary` header instead of
    replacing each other's values.
  - body-size-limiter checks any request that has a body, including DELETE.
  - basic-auth accepts UTF-8 usernames and passwords.
  - logger's `logBody` now logs JSON bodies after the handler read them.
  - oidc fetches the signing keys again (at most every 30 seconds) when a
    token uses an unknown key, so key rotation no longer breaks login.

## 1.0.0-beta (November 2, 2026)

> **A new BurgerAPI.** 1.0.0-beta is a ground-up rewrite of the framework, not
> an update to `0.9.7`. The ideas stay the same (Bun first, file-based routes,
> typed validation, OpenAPI out of the box), but the core, the request
> lifecycle and the public API are all new.
>
> `npm i burger-api` now installs 1.0.0-beta. The old line stays on npm as
> `burger-api@0.9.7`. Upgrading an existing app? Follow
> [Migrating from 0.9.x](https://burger-api.com/docs/migration).
>
> This is a beta: please [open an issue](https://github.com/isfhan/burger-api/issues)
> if anything breaks or feels wrong.

### Requirements

- **Bun 1.4.4+**. On Node: **24.22.1+** or **26.12.1+**. These versions carry
  the October 2026 security fixes (Brotli, TLS).
- TypeScript 5 or 7 (optional; JavaScript is fully supported).
- Published to npm with provenance.

### Highlights

- **Hooks instead of middleware:** six lifecycle points (`onRequest`,
  `transform`, `beforeRoute`, `afterRoute`, `mapResponse`, `onError`).
- **`BurgerContext`:** one typed context for every hook and handler.
- **Plugins and providers:** extend the app in `src/plugins.ts`, share services
  from `src/providers.ts`.
- **Standard Schema validation:** Zod (default), Valibot or ArkType, for body,
  query, params, headers, cookies and responses.
- **OpenAPI 3.1 with a docs UI:** Swagger UI, Scalar or Redoc, generated from
  your routes and schemas.
- **WebSocket routes:** file-based, the same way as API routes.
- **Page routes and static assets** next to your API.
- **Runs everywhere:** Bun natively; Node, Cloudflare Workers, Deno and Vercel
  through `toFetchHandler`.
- **JavaScript is first-class:** the same conventions in `.ts`, `.js` and `.mjs`.
- **Fast:** every route becomes a native Bun route, and production builds
  prepare routes ahead of time.

### Breaking changes from 0.9.x

- `BurgerRequest` is replaced by `BurgerContext`.
- Middleware and the `Middleware` type are removed: use hooks and plugins.
  `middleware.ts` route files are a startup error.
- `BurgerNext` is replaced by `ForwardHookResult` (same shape).
- `use.ts` and `webhook.ts` route files are removed: use `config.ts`.
- Folders no longer pass files down to child routes. Groups `(name)` only
  remove themselves from the URL; every route stands on its own.
- `burger.config.ts` is no longer read: rename it to `burger.build.ts`
  (build-time only).
- Auth helpers moved from `ecosystem/hooks/` to `ecosystem/plugins/`.
- The CLI `serve` command is removed: use `burger-api dev`.
- A route with a body schema rejects non-JSON bodies with `415`.

### What's new

**Routing and pages**

- File-based routes with `[param]` and `[...]` wildcard folders. Route
  priority is static, then `:param`, then wildcard.
- Each route folder holds up to five files: `route`, `schema`, `hooks`,
  `openapi` and `config`. `config.ts` can override settings per method
  (`export const POST = { ... }`).
- `HEAD`, `OPTIONS` and `405` are automatic. `405` and `OPTIONS` send the same
  `Allow` header.
- Trailing slashes are loose: `/users/1/` matches `/users/:id`.
- Page routes under `src/pages/` and static assets, served next to the API.
- API routes, pages, assets, `/docs` and `/openapi.json` share one URL space.
  Any collision is a startup error that names both files.

**Hooks**

- Global hooks in `src/hooks.ts`, route hooks in `api/**/hooks.ts`.
- Request hooks run Framework → Plugin → Global → Route. Response and error
  hooks run in reverse (nearest first).
- Global and plugin response hooks run for every response: 404, 405,
  `OPTIONS`, errors, pages, assets and docs.
- `defineHooks(schema, hooks)` gives route hooks full types.
- Typos in convention files warn at startup with the valid names.

**Context**

- `ctx.params`, `ctx.query`, `ctx.headers`, `ctx.validated`, `ctx.config`,
  `ctx.services` and `ctx.route`, built lazily per request.
- `ctx.set` changes the status, headers and cookies of the response.
- `ctx.ip`: the client address from the socket. Forwarded headers are never
  trusted.
- `ctx.publish(topic, message)` sends to WebSocket subscribers (Bun).

**Validation**

- One `schema.ts` per route with per-method exports.
- Optional coercion for query, params, headers and cookies.
- Response validation: `dev` (default, logs only), `enforce` or `off`.
- Errors use RFC 9457 Problem Details. Production error bodies never include
  stack traces or schema details.
- Invalid schema keys fail at startup, not at request time.

**OpenAPI and docs**

- OpenAPI 3.1 at `/openapi.json`, docs UI at `/docs`, both configured in
  `src/openapi.config.ts` (optional password protection with `docsAuth`).
- Uses a validator's own JSON Schema output (Zod, ArkType). A custom
  `mapJsonSchema` converter still takes priority.

**Plugins and providers**

- `burger.usePlugin()` in `src/plugins.ts` adds hooks. Plugin factories are
  supported, and duplicates are removed.
- `burger.provide()` in `src/providers.ts` adds shared services on
  `ctx.services`.
- Type your app with module augmentation (`BurgerContext`, `BurgerServices`,
  `BurgerAuthUser`), usually in `src/types.ts`.

**WebSocket**

- File-based routes under `src/websocket/`, or `burger.websocket()`.
- `ws.params`, `ws.wildcardParams`, `ws.query`, `ws.url` and `ws.user`.
- Messages arrive in order, and only after `open` has finished.
- App-level `onOpen`, `onMessage` and `onClose` hooks.
- Works on Bun, Cloudflare Workers, Deno and Node (via `@burger-api/node-server`).

**Errors**

- `HTTPError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`,
  `ForbiddenError` and `MethodNotAllowedError`.
- Unhandled 5xx errors are logged on the server with the method, path and
  stack.

**Deploy**

- `app.serve(port)` on Bun.
- `toFetchHandler(app)` for Node 24+, Cloudflare Workers, Deno and Vercel:
  HTTP only, no filesystem scanning, no Bun imports.
- `@burger-api/node-server`: one `serve(app)` call for a real Node server,
  WebSockets included.

**Ecosystem**

- Official hooks: cors, logger, rate-limiter, cache, compression,
  security-headers, timeout and body-size-limiter.
- Official plugins: api-key, basic-auth, env, jwt-auth, oidc and session.
- Install any of them with `burger-api add <name>`.

### Performance

- On Bun, every route is a native per-method Bun route, with no framework
  lookup per request.
- Hooks, validation and the handler are compiled into one function per route
  at startup. Nothing becomes `async` unless a step returns a promise.
- Work a route never uses (param parsing, the `validated` object) is skipped.
- Other runtimes use a radix matcher for dynamic routes and a direct lookup for
  static ones.

Benchmarks: [burger-api-benchmarks](https://github.com/isfhan/burger-api-benchmarks).

### Known limitations

- On Node, Workers, Deno and Vercel, prebuilt pages and assets work, but Bun
  HTML bundles and dynamic (`[param]`) pages need Bun. A startup warning lists
  them.
- `ws.subscribe()`, `ws.publish()` and `ctx.publish()` use Bun's pub/sub and
  throw on other runtimes.
- Cloudflare Workers needs `nodejs_compat` in `wrangler.toml` (the CLI writes
  it for you).

---

## Previous versions (0.x)

### 0.9.7 (May 16, 2026)

- CLI reliability fixes: commands exit cleanly after GitHub requests finish.

### 0.9.6 (March 18, 2026)

- More reliable `build` and `build:exec`, with the same route rules in
  development and production.
- Production can start from a prebuilt route list, with no file scanning.

### 0.7.0 (December 24, 2025)

- Added the CLI for creating projects and managing middleware.

### 0.6.3 (December 17, 2025)

- Added a release workflow for CLI executables.

### 0.6.2 (November 13, 2025)

- Faster middleware execution with precomputed middleware arrays.
- Simpler middleware return types: `Response`, a function, or `undefined`.
- Moved to a Bun workspace monorepo (`packages/burger-api`, `packages/cli`).

### 0.5.2 (November 9, 2025)

- Internal cleanup of wildcard parameter handling; tests and READMEs for all
  examples.

### 0.5.0 (November 1, 2025)

- Automatic `OPTIONS` handler for CORS preflight.
- "After" middleware runs in reverse order, even after an early response.
- Fixed TypeScript types for package consumers.

### 0.4.0 (October 21, 2025)

- Wildcard routes with `[...]` folders, available as `wildcardParams` and in
  OpenAPI.

### 0.3.0 (August 15, 2025)

- Upgraded to Zod 4 and dropped `zod-to-json-schema`.

### 0.2.3 (May 2, 2025)

- Removed the custom request and response classes.

### 0.2.0 (April 26, 2025)

- Faster core and middleware handling; better OpenAPI output.

### 0.1.5 (April 2, 2025)

- Trie-based route matching; dependency updates.

### 0.1.4 (March 23, 2025)

- Prettier config, better types and error handling.

### 0.1.1 (March 15, 2025)

- Middleware uses the `BurgerNext` type.

### 0.1.0 (March 10, 2025)

- Static `.html` pages with file-based routing, `(group)` folders and `[slug]`
  routes.

### 0.0.39 (February 25, 2025)

- First release: Bun HTTP server, file-based API routes, Zod validation,
  OpenAPI and Swagger, middleware.
