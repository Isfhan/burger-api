## 📣 Release Notes - Burger API Framework

### Version 1.0.0-beta

Release date: TBD (set at publish).

The biggest release since `0.9.7`, the last version on npm. 1.0.0-beta is a
full rewrite of the framework with many new features: a six-point hook
lifecycle, plugins and providers, Standard Schema validation, automatic
OpenAPI with a built-in docs UI, file-based WebSocket routes, page routes,
per-method Bun native routes, first-class JavaScript, and a WinterCG deploy
surface through `toFetchHandler`.
This is a breaking rewrite: the `0.9.x` line stays on npm
(`burger-api@0.9.7`).

Please try it and [open an issue](https://github.com/isfhan/burger-api/issues)
if anything breaks or feels wrong.

#### ✨ Highlights

- **Hooks replace middleware:** `onRequest`, `transform`, `beforeRoute`,
  `afterRoute`, `mapResponse`, `onError`; global hooks in `src/hooks.ts`, route
  hooks in `api/**/hooks.ts`.
- **`BurgerContext`** replaces `BurgerRequest` as the single typed context for
  every hook and handler.
- **Plugins and providers:** `burger.usePlugin()` in `src/plugins.ts` and
  `burger.provide()` in `src/providers.ts` (`ctx.services`).
- **Standard Schema validation:** Zod default, plus Valibot and ArkType, for
  query, params, headers, cookies, and body, with optional response validation.
- **OpenAPI 3.0 + docs UI:** generated from routes and schemas, with Swagger UI,
  Scalar, and Redoc built in (`/openapi.json`, `/docs`).
- **WebSocket routes:** file-based under `src/websocket/`, plus
  `burger.websocket()`.
- **Page routes and static assets:** file-based pages under `src/pages/`.
- **Bun-native performance:** routes are registered as per-method native Bun
  routes, and `burger-api build` prepares routes ahead of time (AOT).
- **JavaScript is first-class:** `.ts` / `.js` / `.mjs` conventions, `create
  --lang js`, JSDoc types.
- **Multi-runtime:** `app.serve()` on Bun; `toFetchHandler(app)` for Node 24+
  (with the `@burger-api/node-server` adapter), Cloudflare Workers, Deno, and
  Vercel.

#### ⚠️ Breaking changes (upgrading from 0.9.x)

- `BurgerRequest` -> `BurgerContext`: one typed context for every hook and
  handler.
- Middleware and the `Middleware` type removed: use hooks and plugins.
- `middleware.ts` route files are rejected: the framework has no middleware
  concept.
- `use.ts` / `webhook.ts` route convention files removed: use `config.ts`.
- Group/folder inheritance removed: groups strip the URL path only, routes are
  self-contained.
- `burger.config.ts` -> `burger.build.ts` (build-time only).
- CLI `serve` command removed: use `burger-api dev`.
- Auth factories moved from `ecosystem/hooks/` to `ecosystem/plugins/`
  (api-key, basic-auth, env, jwt-auth, oidc, session).
- `ctx.services` is one shared, frozen app-level object: assigning keys throws,
  put per-request data in `transform`.
- `ctx.set` is a tracked object: `Object.keys` / spread give `{}`,
  `JSON.stringify` works.
- `ctx.params` is always an object (`{}` when a route has none) and
  `ctx.wildcardParams` always an array, typed non-optional.
- A declared body schema rejects non-JSON bodies with **415 Unsupported Media
  Type** (validation used to be skipped); `application/*+json` counts as JSON,
  and `ctx.validated.body` is non-optional in the inferred type when the schema
  declares `body`.
- `defineHooks(schema, hooks)` hooks run for every method of a route, so
  `ctx.validated` slots are typed possibly `undefined` (`HookContext`);
  `transform` and `onError` can see `ctx.validated` itself as `undefined`.
- WebSocket: `ws.params` holds decoded route params, and the matched compiled
  route is no longer exposed on `ws.data`.

Step-by-step guide: [Migrating from 0.9.x](https://burger-api.com/docs/migration).

#### 🆕 New features

**Hooks & lifecycle**

- Six hook points: `onRequest`, `transform`, `beforeRoute`, `afterRoute`,
  `mapResponse`, `onError`.
- Global hooks in `src/hooks.ts` (auto-discovered, next to `index.ts`), route
  hooks in `api/**/hooks.ts`; global hooks are loaded once and merged with each
  route's hooks at compile time.
- Request hooks run Framework -> Plugin -> Global -> Route; response and error
  hooks run nearest-first, Route -> Global -> Plugin -> Framework.
- `defineHooks(schema, hooks)` type helper for typed route hooks.
- `ErrorHook` may be async (`Promise<Response | void>`).
- Unknown exports in convention files warn with the file and the valid names
  (`hooks.ts` typos, `onRequest` in a route `hooks.ts`, lowercase `get` in
  `route.ts`).

**Context**

- `BurgerContext`: a single, lazily built context per request with a stable
  prototype, plus dead-path elimination for fields a route never reads.
- `ctx.query`, `ctx.params`, `ctx.route` (`{ path, pattern }`), `ctx.headers`,
  `ctx.validated`, `ctx.set`, and the standard `Request` surface.
- New `ctx.ip`: the socket peer address on Bun, `undefined` on WinterCG `fetch`
  entries; adapters can supply it via `setRequestIP(request, ip)`. Forwarded
  headers are never trusted.
- `ctx.validated` is always an object after validation.
- `ServerOptions.maxRequestBodySize` (forwarded to `Bun.serve`).

**Validation**

- Standard Schema support: Zod (default), Valibot, and ArkType through the same
  `schema` export.
- Compiled validators: prepared once per route and cached by structural key, so
  identical schemas share one validator.
- Model registry: define a shape once in `ServerOptions.models` and reference
  it by name from any route's `schema` slot.
- Opt-in coercion for query, params, headers, and cookies (`validation.coerce`
  app-wide or `coerce: true` per route).
- Response validation: `off` (default), `dev` (observe, never break), or
  `enforce` (safe error on mismatch).
- Header and cookie validation via the `headers` / `cookie` schema slots.
- Problem Details errors (RFC 9457) via `validation.errorFormat`; production
  error bodies never leak stacks or schema internals.
- Query/header coercion wraps single values for `z.array(...)` fields, coerces
  array elements, and accepts `"1"` / `"0"` booleans.

**OpenAPI & docs**

- OpenAPI 3.0 generated from routes and schemas, with Swagger UI, Scalar, and
  Redoc built in (`/openapi.json`, `/docs`).
- `src/openapi.config.ts`: OpenAPI metadata, docs UI choice, and docs auth.

**Plugins & providers**

- `burger.usePlugin()` in `src/plugins.ts` and `burger.provide()` in
  `src/providers.ts` (services on `ctx.services`).
- `usePlugin()` accepts a plugin factory (`PluginFactory`), and plugin
  factories are resolved before deduplication.

**Routing & pages**

- File-based routing: `[param]` dynamic routes and `[...]` wildcard routes
  (`ctx.params`, `ctx.wildcardParams`); groups `(name)` strip the URL path only.
- Page routes under `src/pages/` and static assets, served next to the API.
- `config.ts` per route: `auth`, `cache`, `timeout`, and other keys are data for
  plugins and hooks; core honors a per-route `responseValidation` override.
- Compiled core: the file tree compiles into an immutable app (`RouteModule` ->
  `CompiledRoute`); the scanner is a pure filesystem walk that reports routes
  plus the global hooks path, the loader merges convention files (inline
  `route.ts` exports win), and duplicate route paths fail fast at compile time.
- Filesystem mode: unset `apiDir` / `pageDir` / `wsDir` default to `src/api` /
  `src/pages` / `src/websocket` when those directories exist.

**WebSocket**

- File-based WebSocket routes under `src/websocket/` (or `config.wsDir`), plus
  programmatic `burger.websocket()`.
- App-level WS hooks (`onOpen` / `onMessage` / `onClose`) apply to prebuilt and
  programmatic routes.
- `createNodeWsBridge()` runs WebSocket routes on Node through the `ws`
  package.

**JavaScript**

- Same conventions in `.ts` / `.js` / `.mjs`; the scanner fails loud when
  conflicting extensions coexist (for example `route.ts` + `route.js`).
- `create --lang js` scaffolds a `jsconfig.json` (`checkJs: true`) project with
  JSDoc-typed `.js` files.
- `generate route|hook|plugin|ws` follows the project language (`--lang` or
  `jsconfig.json` detection); `generate ws` honors `config.wsDir`.

**Deploy targets / WinterCG**

- `app.serve()` on Bun; `toFetchHandler(app)` for Node 24+, Cloudflare Workers,
  Deno, and Vercel.
- AOT `apiRoutes` required on non-Bun runtimes (no filesystem); shared types no
  longer import `bun`, and param extraction uses only `Request.url` so it stays
  WinterCG-safe.
- `@burger-api/node-server`: `serve(app)` bridges `node:http` to
  `toFetchHandler` and wires `createNodeWsBridge()` + `ws` automatically.
- Web Standard `Request` / `Response` throughout; `BunAdapter` is the only
  runtime-specific surface (Bun's native `routes` map, with a trie fallback).

**Ecosystem**

- Official hooks (cors, logger, rate-limiter, cache, compression,
  security-headers, timeout, body-size-limiter) and plugins (api-key,
  basic-auth, env, jwt-auth, oidc, session), installed via `burger-api add`.

#### ⚡ Performance

No behavior change; measured with
[burger-api-benchmarks](https://github.com/isfhan/burger-api-benchmarks).

- Routes are registered as per-method Bun native handlers, specialized at
  startup: no per-request method lookup.
- One flattened function per route and method; routes without hooks call the
  handler directly with no extra `async` layers.
- Dynamic route params come from Bun's already-decoded `req.params`.
- `ctx.services` is built once per app as a shared, frozen object instead of
  copied on every request.
- `ctx.ip` is resolved lazily on first read.
- 404/405 bodies are prebuilt, and the fallback router allocates nothing before
  matching when there are no `onRequest` hooks.
- Query strings are parsed in a single pass and decoded only when they contain
  `%` or `+`, with `URLSearchParams` parity (including `+` to space and
  malformed-escape leniency).
- Hooks, transforms and validation run sync-first: `await` only happens when a
  step really returns a promise, in the JIT and the interpreter.
- Validation is specialized per method at startup; only the body slot is async.
- The route-access analyzer skips param extraction and the empty `validated`
  bag when it can prove a route never reads them.
- `ctx.set` tracks what changed, so untouched responses are returned as is and
  status-only changes skip copying headers.
- Pathname parsing and trie matching decode segments only when they contain
  `%`, with no per-request `split` / `map` or param-object copies.
- The fetch-handler path (`fetchHandler()`, Cloudflare, Deno, Vercel,
  node-server) uses a compressed character radix matcher for dynamic routes,
  direct dispatch for static routes, parses the pathname once, and clones a
  prebuilt 404.

#### 🐛 Fixes

- **Cloudflare Workers crashed on boot:** a dead, eagerly-evaluated
  module-level `Response` constant in `utils/response.ts` crashed every Worker
  before any request was handled. Removed; it had zero live references.
- **`config.ts` was silently dropped in production builds:** a route's
  `config.ts` bundled as a raw module namespace instead of unwrapping its
  default export, so `ctx.config` was `undefined` after
  `bun run build && bun run start`.
- **`dist` was not resolvable under stock Node ESM:** explicit `.js`
  extensions on every relative import and `NodeNext` module resolution; the
  published package now imports under plain `node`, no bundler or loader.
- **`build:exec` standalone executables crashed on startup** ("Cannot find
  module 'burger-api/adapter/bun'"): the generated entry now statically imports
  the Bun adapter and injects it through the existing `ServerOptions.adapter`
  seam.
- **Route-level `onRequest` is now a compile error:** it never ran, so
  declaring it in a route's `hooks.ts` fails `tsc` instead of silently doing
  nothing.
- **`ForwardHookResult` widened to the runtime's real behavior:** forward hooks
  returning a mapper are now typed; `BurgerNext` is deprecated, aliased to
  `ForwardHookResult`.
- **`plugins.ts` / `providers.ts` type against narrow registrars:** the
  callback parameter is `PluginRegistrar` / `ProviderRegistrar`, and the
  default export's return value is now awaited.
- **`createNodeWsBridge()` was non-functional:** five bugs fixed (types, the
  upgrade check, routing, `ws.data`, text frames); it now works against the
  real `ws` package.
- **`process.env.NODE_ENV` could crash every request on Deno:** reads go
  through a guarded helper, so no `--allow-env` flag is needed.
- **`ASSET_MIME` / `contentTypeFor` no longer drag in `node:fs`:** moved to a
  leaf module (and the remaining bare `'path'` imports moved to `'node:path'`),
  with a test that walks the built import graph to keep it that way.
- **Cloudflare Workers still needs `nodejs_compat`:** documented as a required
  `wrangler.toml` setting, because wrangler resolves dynamic imports at build
  time.
- **AOT/production builds now apply every global hook:** `transform`,
  `beforeRoute`, `afterRoute`, `mapResponse`, and `onError` from
  `src/hooks.ts`, not just `onRequest`.
- **Response hooks run nearest-first as documented:** `afterRoute` /
  `mapResponse` / `onError` go Route -> Global -> Plugin -> Framework, and user
  hook arrays are never mutated.
- **JIT and interpreter agree on a `beforeRoute` short-circuit:** collected
  mappers, response validation, `afterRoute`, and `mapResponse` still run on
  the short-circuit response.
- **Dynamic routes keep the `onRequest` context:** state seeded pre-routing
  reaches the handler on Bun's native router.
- **A handler returning a non-`Response` fails loud:** 500 with a clear dev
  message instead of a "Welcome to Bun!" 200.
- **Unhandled 5xx errors are logged server-side:** method, path, error, and
  stack, in dev and production.
- **`ctx.json()` works after body validation:** the parsed body is cached, and
  malformed JSON is a 400 Problem Details, not a 500.
- **Plugin factories are resolved before deduplication:** two anonymous
  factories are no longer collapsed into one; duplicate registrations warn.
- **Trailing slashes:** `/api/products/1/` matches `/api/products/:id`, a
  `:param` never binds an empty segment, and WebSocket params are URL-decoded.
- **Global/plugin `onRequest` runs for pages, assets, and docs:** pages, static
  assets, `/openapi.json`, and `/docs` now get the hooks; a short-circuit keeps
  earlier mappers (for example CORS headers on a 429).
- **Every route answers `OPTIONS`:** 204 + `Allow`, skipping `beforeRoute` so
  auth hooks do not reject preflights; not documented in OpenAPI.
- **Auto-`HEAD` reports the `GET` response's `Content-Length`.**
- **OpenAPI request bodies and AOT namespaces:** bodies are documented
  input-side (`.default()` fields optional, no `additionalProperties: false`),
  and AOT routes with `GET` / `POST` keys keep parameters, bodies, and
  metadata.
- **`responseValidation: 'enforce'`:** a generic Problem Details 500 in
  production (issues only in dev), logs the mismatch, and still runs
  `afterRoute` / `mapResponse`.
- **Problem Details `title` is the HTTP status phrase**, also for thrown
  `{ status }` objects and WebSocket 401/403 responses.
- **`apiPrefix: ''` mounts API routes at `/`** (it silently became `api`).
- **`toFetchHandler` matches exact static paths only** and now serves prebuilt
  page routes and embedded assets (Bun-only HTML bundles and dynamic pages log
  one warning instead of silently 404ing).
- **WebSocket fixes:** push platforms (Deno, Cloudflare) deliver `open` /
  `message`, app-level WS hooks apply to prebuilt and programmatic routes, a
  malformed handshake is 400, and a WS route shadowed by an HTTP route warns at
  startup.
- **`serve()` on a busy port** prints one clear line and exits 1; invalid ports
  throw a clear error.
- **`createNodeWsBridge()` called too early** now says exactly what to call
  first.
- **An empty `src/api`** explains the expected layout instead of "No routes
  configured".
- **Pages or assets without API routes** still run global and plugin
  `onRequest` hooks for pages, assets, `/openapi.json`, and `/docs`.
- **Page handlers receive `ctx.services` and `ctx.ip`.**
- **`transform: { ip }` no longer throws:** `ctx.ip` is a getter-only
  accessor, so `ip` is dropped like the other reserved transform keys.

#### 📌 Known limitations

- **Pages are mostly Bun-only:** on WinterCG targets `toFetchHandler` serves
  prebuilt function page routes and embedded assets, but Bun HTML-import
  bundles and dynamic (`[param]`) pages are served only by `serve()` on Bun (a
  startup warning lists them).

### Version 0.9.7 (May 16, 2026)

- **CLI (published with this tag)** – Reliability and DX fixes: GitHub HTTP
 timeouts no longer keep the process alive after work finishes; clearer
 subprocess and entry handling; small contributor note in the CLI README.

### Version 0.9.6 (March 18, 2026)

- 🚀 **Production builds** – `build` and `build:exec` work better and are more
 reliable.
- 🎯 **Same rules everywhere** – Same route and path rules in development and
 production builds.
- 📦 **No file scanning in production** – You can pass in route lists when
 starting the server so production does not need to scan files.
- 🧪 **Example tests** – A shared helper starts and stops the server safely.
- 📋 **Test scripts** – Run framework and CLI tests from the repo root.

### Version 0.7.0 (December 24, 2025)

- 🔧 **CLI & Release Improvements:**
 - Added CLI tool for creating new projects and managing middleware
 - Updated README.md


### Version 0.6.3 (December 17, 2025)

- 🔧 **CLI & Release Improvements:**
 - Added GitHub Actions release workflow for CLI executables
 - Updated README.md


### Version 0.6.2 (November 13, 2025)

- ⚡ **Major Performance Improvements:**

 - middleware execution with specialized fast paths
 - AOT compilation with pre-computed middleware arrays
 - Zero runtime allocations (pre-allocated arrays)
 - Manual loop unrolling for 2-middleware case
 - Reduced code from ~110 to ~80 lines

- 🎯 **Simplified Middleware System:**

 - Clearer return types: Response, Function, or undefined
 - Removed complex "around" middleware pattern
 - Dedicated fast paths for 0, 1, and 2 middlewares
 - Better JIT optimization

- 📦 **Monorepo Structure:**

 - Converted to Bun workspace monorepo
 - Core framework in `packages/burger-api`
 - CLI tool in `packages/cli` (under development)
 - Ecosystem middleware at root level

- 🔧 **Developer Experience:**
 - 100% backward compatible
 - Clearer documentation
 - Easier to understand codebase

### Version 0.5.2 (November 9, 2025)

- 🔧 **Internal Improvements:**
 - Refactored wildcard parameter extraction logic into reusable utility
 functions
 - Added test suites and README files for all example projects

### Version 0.5.0 (November 1, 2025)

- 🌟 **Feature:** Auto-injected OPTIONS handler for CORS preflight:

 - Automatically injects an OPTIONS handler for CORS preflight when needed
 - Only injects if the route defines any preflight-triggering methods and
 lacks an OPTIONS handler
 - Injects a minimal OPTIONS handler that returns a 204 No Content response
 - Works for all HTTP methods that trigger CORS preflight (POST, PUT,
 DELETE, PATCH)
 - Does not inject if the route already has an OPTIONS handler

- 🌟 **Feature:** Improved response handling in middleware (after
 middlewares):

 - After middlewares now run even if the current middleware already
 returned a response
 - After middlewares run in reverse order to make changing the response
 easier and to help with CORS

- 🐛 **Bug Fix:** Fixed TypeScript type resolution for package consumers:
 - Users now get full IntelliSense, autocomplete, and type safety out of
 the box
 - Improved build process by removing `tsc-alias` dependency
 - Converted `src/types/index.d.ts` to `src/types/index.ts` for proper
 emission
 - Updated all 49 files across `src/` and `examples/` folders
 - Build is now faster and more reliable
 - Universal compatibility across Bun

### Version 0.4.0 (October 21, 2025)

- 🎯 **Wildcard Routes:**
 - Added wildcard routes using `[...]` folder name - matches any path after
 it
 - Create routes that handle multiple path segments automatically
 - Access all matched path parts through `wildcardParams` in your request
 - Routes are matched in order: exact paths first, then dynamic routes
 (like `[id]`), then wildcards last
 - Works inside dynamic routes too (example: `/api/users/[userId]/[...]`)
 - View wildcard routes in OpenAPI docs and Swagger UI
 - Added easy-to-follow examples showing different ways to use wildcard
 routes

### Version 0.3.0 (August 15, 2025)

- 🔧 **Updated Zod to version 4:**
 - Updated Zod version from 3.x to 4.x
 - Updated built-in request validation middleware to use Zod 4
 - Updated and better request validation middleware error handling
 - Removed Zod-to-json-schema dependency and use Zod 4 directly

### Version 0.2.3 (May 2, 2025)

- ⚡ **Core Improvements:**

 - Removed custom request/response classes for simpler API
 - Enhanced type safety and error handling

### Version 0.2.0 (April 26, 2025)

- ⚡ **Performance & Core Improvements:**
 - Optimized framework core and improved middleware handling
 - Enhanced OpenAPI documentation and route tracking
 - Updated ID preprocessing logic in schema validation
 - Improved type definitions across the framework

### Version 0.1.5 (April 2, 2025)

- 🔧 **Dependencies & Build:**

 - Updated dependencies to latest versions
 - Enhanced build process with tsc-alias
 - Improved TypeScript configuration

- 📦 **Package Updates:**

 - Updated zod to version ^3.24.2
 - Updated zod-to-json-schema to version ^3.24.5
 - Updated TypeScript peer dependency to ^5.7.3

- ⚡ **Performance & Core Improvements:**
 - Enhanced request handling and middleware execution in Burger class
 - Implemented trie structure for optimized route management
 - Improved route collection and validation in ApiRouter
 - Enhanced OpenAPI integration with better route handling

### Version 0.1.4 (March 23, 2025)

- 🎨 **Code Quality & Standards:**

 - Added Prettier configuration for consistent code style
 - Enhanced code formatting and structure across the codebase
 - Improved type definitions and safety
 - Enhanced error handling and response formatting

- 🔄 **Refactoring and Improvements:**
 - Enhanced page routing and server response handling
 - Improved import paths configuration
 - Updated request/response handling
 - Enhanced server initialization process

### Version 0.1.1 (March 15, 2025)

- 🔧 **Middleware Improvements:**
 - Updated middleware to use BurgerNext type for next function
 - Enhanced type safety in middleware chain

### Version 0.1.0 (March 10, 2025)

- 🎨 **Static Page Serving:**
 - Basic support for serving static `.html` files
 - File-based routing for pages
 - Support for route grouping with `(group)` syntax
 - Support for dynamic route with `[slug]` syntax

### Version 0.0.39 (February 25, 2025)

- 🚀 Initial release with core API features
- ⚡ Bun-native HTTP server implementation
- 📁 File-based API routing
- ✅ Zod schema validation
- 📚 OpenAPI/Swagger integration
- 🔄 Middleware system
