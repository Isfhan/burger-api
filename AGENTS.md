# AGENTS.md — BurgerAPI Project Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Project Overview

BurgerAPI is a **Bun-first**, WinterCG-compatible, **file-based** TypeScript
**and JavaScript** API framework: file-based routing, end-to-end type safety,
hook-based request lifecycle, small core + rich ecosystem.

- **Tech:** Bun >= 1.4.0 (primary), Node 24+ / edge where practical.
  TypeScript and JavaScript ESM (`.ts` / `.js` / `.mjs`). Zod ^4 / Standard Schema.
- **Packages:** `burger-api` (framework), `@burger-api/cli`,
  `@burger-api/node-server` (plain Node 24+ server, WebSocket via `ws`).
- **Status:** 1.0.0-beta. The public API below is locked; core uses
  `BurgerContext` and the six hook names.
- **Homepage:** https://burger-api.com

### Public architecture

**App files** (siblings of the entry `src/index.ts`, all optional except the entry):

```
src/index.ts          # new Burger({...}) + serve() ONLY
src/plugins.ts        # export default function (burger) { burger.usePlugin(...) }
src/providers.ts      # export default function (burger) { burger.provide(name, service) } → ctx.services
src/hooks.ts          # global hooks (6 HTTP points) + WebSocket onOpen/onMessage/onClose
src/openapi.config.ts # OpenAPI metadata, docs UI, docs auth
src/types.ts          # app types and `declare module 'burger-api'` augmentations (scaffolded)
src/api/**/           # API routes
src/pages/**/         # optional pages + assets
src/websocket/**/     # optional WebSocket routes
burger.build.ts       # build-time only (CLI), not runtime config
```

`plugins.ts` / `providers.ts` must default-export a function (startup error
otherwise). It receives a narrow registrar: `usePlugin` / `provide` only.

**Route convention files** (first-class, no inheritance):

| File        | Role                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| `route.*`   | Handlers: `export async function GET(ctx: BurgerContext)` → `Response`        |
| `schema.*`  | Per-method exports: `export const GET = { body, query, params, headers, cookies, response }`; optional top-level `export const coerce = true` |
| `hooks.*`   | Route hooks for that route only (no `onRequest`: it runs before routing)      |
| `openapi.*` | Per-method OpenAPI metadata                                                   |
| `config.*`  | `export default { ... }` route-wide; `export const POST = { ... }` per-method override (shallow merge) |

Extension is `.ts`, `.js`, or `.mjs` (scaffolded with `--lang ts|js`, default
`ts`). A route directory must not contain both `route.ts` and `route.js`.
`middleware.*`, `use.*` and `webhook.*` are forbidden files (startup error).

`config.*` is exposed as `ctx.config`. Core reads only `responseValidation`
(`'off' | 'dev' | 'enforce'`, default `'dev'`); every other key (`auth`,
`cache`, `timeout`, …) is data for plugins and hooks.

Per-method named exports (`GET`, `POST`, …) replace lowercase method objects in
route/schema/openapi/config.

**Hooks (lifecycle) vs plugins (extensions):**

- **Hooks** control request execution: `onRequest`, `transform`, `beforeRoute`,
  `afterRoute`, `mapResponse`, `onError`.
- **Plugins** are `{ name, hooks? }` (or a factory returning one), registered
  with `burger.usePlugin()` in `plugins.ts`. A plugin contributes hooks only.
  Services come from `providers.ts` (`burger.provide`). Context typing is done
  with module augmentation (`BurgerContext`, `BurgerServices`, `BurgerAuthUser`),
  which a plugin file may declare.

They are separate. Do not describe plugins as “middleware replacement.”

**Lifecycle:**

```
onRequest → Routing → transform → Validation → beforeRoute
 → Handler → afterRoute → mapResponse
```

Error → `onError`. Scopes: Framework → Plugin → Global → Route for request hooks.
Response hooks (`afterRoute`, `mapResponse`) run Route → Global → Plugin → Framework
(nearest-first — see `chain/flattener.ts`).
Error hooks (`onError`) run nearest-first, Route → Global → Plugin → Framework.

- A forward hook (`onRequest`, `beforeRoute`) returning a `Response` stops the
  pipeline. A response hook returning a `Response` replaces the response; later
  response hooks still run.
- Global and plugin `afterRoute` / `mapResponse` run for **every** response the
  app produces: 404, 405, auto-OPTIONS, errors, pages, assets, `/docs`,
  `/openapi.json`. Route hooks run only for matched routes.
- `transform` must not set reserved `BurgerContext` keys (startup error).
- Response changes go through `ctx.set` (`status`, `headers`, cookies), applied
  once at the end. `ctx.set.headers` is always defined; array values and
  `Set-Cookie` append.

**Context:** public type **`BurgerContext`** (`ctx.params`, `ctx.query`,
`ctx.validated`, `ctx.config`, `ctx.services`, `ctx.set`, `ctx.ip`,
`ctx.publish`, …). Standard Web **`Response`** only.

**Deploy surface:**

- Bun: `burger.serve(port)`. Every route becomes a per-method native Bun route.
- WinterCG (Cloudflare Workers, Vercel, Deno, Node 24+):
  `burger.fetchHandler()` or `toFetchHandler(burger)` →
  `(request, env?, ctx?) => Promise<Response>`. HTTP-only, no filesystem
  scanning, no Bun imports.
- Node: `serve(burger)` from `@burger-api/node-server`.
- HEAD is derived from GET; the server drops the body. OPTIONS is automatic.
  `Allow` lists HEAD (when GET exists) and OPTIONS.

**Validation:** schemas run after `transform`, before `beforeRoute`. Failure
throws `ValidationError` → `onError` → default 422 + RFC 9457. Response schemas
are keyed by status (`200`) or class (`2xx`) and checked for JSON responses
(`application/json` and `application/*+json`).

**Debug:** on only with `debug: true` or `NODE_ENV=development`
(`burger-api dev` sets it). Controls stack traces and dev-mode response
validation.

**OpenAPI:** 3.1 document generated from routes and schemas, served at
`/openapi.json` with a docs UI at `/docs` (configured in `openapi.config.ts`).

**Ecosystem** (copied into projects by `burger-api add`):

```
ecosystem/hooks/   # body-size-limiter, cache, compression, cors, logger,
                   # rate-limiter, security-headers, timeout
ecosystem/plugins/ # api-key, basic-auth, env, jwt-auth, oidc, session
ecosystem/skills/  # AI skills (burger-api)
```

**Auth:** ecosystem plugins under `ecosystem/plugins/` **only**, reading route
`config.ts` (`auth: false` opts a route out). Auth plugins type `ctx.user` by
augmenting `BurgerAuthUser`. Core is auth-agnostic.

**WebSocket:** file-based router under `src/websocket/` (or `wsDir`);
programmatic `burger.websocket()`, options via `burger.wsConfig()`. `ws.params`,
`ws.wildcardParams`, `ws.query`, `ws.url`, `ws.user`. Messages are delivered in
order and only after `open` finished. Publish from HTTP with `ctx.publish`.

**Fail loud at startup** (never silently at request time): route path
collisions (API, pages, assets, docs, spec), two dynamic folders or page files
at one level, named wildcard folders (`[...slug]`, in dev and build), reserved
transform keys, invalid response schema keys, uppercase header schema keys,
forbidden files, `plugins.ts` / `providers.ts` without a default function.

### Legacy code (removed)

The following have been removed: `BurgerRequest`, `Middleware` type,
`beforeHandle`/`afterHandle`/`onResponse`/`provide` hook, group inheritance,
`burger.config.ts`, `use.ts`/`webhook.ts` discovery, `Burger.use`, CLI `serve`
(command), auth factories under `ecosystem/hooks/` (api-key-auth, jwt-auth: use
`ecosystem/plugins/` instead), and the legacy `core/api-router.ts` shell. All
public API now uses `BurgerContext`, hooks
(`beforeRoute`/`afterRoute`/`mapResponse`/`transform`/`onRequest`/`onError`),
and plugins.

---

## Essential Commands

```bash
bun install
bun run build              # framework dist (needed by linked packages, CLI e2e, benchmarks)
bun run typecheck
bun run test:all           # every suite + typecheck, with a summary
E2E_FULL=1 bun run test:all  # also the full CLI e2e (Bun, Node 24, deno, wrangler)
bun run test:framework
bun run test:cli
bun run test:e2e:full
bun run test:route-sync
bun run dev
```

Local CLI testing with `bun link` and local mode (`--local` /
`BURGER_API_LOCAL=1`): see `LOCAL_TESTING.md`. CI (`.github/workflows/ci.yml`)
runs `test:all` on Bun 1.4.2 + Node 24.

## Architecture (code layout)

- `packages/burger-api/`: core (`Burger`, compiler, router, lifecycle, OpenAPI,
  validation, ws, adapters). Live discovery: `compiler/scanner.ts` +
  `compiler/module-loader.ts`. Adapters: `adapter/bun/` (Bun-only) and
  `adapter/web-standard/` (`toFetchHandler`, WinterCG).
- `packages/cli/`: create, add, list, skills, generate, dev, start, build,
  build:exec, inspect, doctor. `create` scaffolds `AGENTS.md` (no CLAUDE.md) and
  `src/types.ts`; `--lang ts|js`, `--defaults`, `--local`.
- `packages/node-server/`: Node `http` bridge + WebSocket for `fetchHandler`.
- `ecosystem/hooks/`, `ecosystem/plugins/`, `ecosystem/skills/`: official
  ecosystem (each with its own README).
- Router: `serve()` registers per-method Bun native routes. The fetch path does
  one `Map` lookup for every exact static path (pages, assets, docs, static API
  routes), then a radix trie for dynamic routes (`engine: 'regex'` opts into a
  regex matcher). Hook plans are compiled per route at startup (JIT unless
  `jit: false`).
- AOT route discovery in production builds (`burger-api build`).

## Related Repositories

- **`burger-api`** (this repo): framework + CLI + ecosystem
- **`burger-api-website`**: docs site (update it for every user-visible change)
- **`burger-api-benchmarks`**: **only** place for benchmarks (never add
  `bench/` here)

## Rule 1 — Think Before Coding

State assumptions. If uncertain, ask. Push back on overengineering. Stop when
confused.

## Rule 2 — Simplicity First

Minimum code. No speculative features. No single-use abstractions.

## Rule 3 — Surgical Changes

Touch only what you must. Match existing style in local code; match the public
architecture for public API/docs.

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.

## Rule 5 — Use the Model Only for Judgment Calls

Prefer code for deterministic transforms.

## Rule 6 — Read Before You Write

Read exports, callers, utilities first. Key files:
`packages/burger-api/src/index.ts`, `compiler/*`, `router/*`, `lifecycle/*`,
`types/index.ts`.

## Rule 7 — Surface Conflicts, Don't Average Them

If patterns contradict, pick the public architecture for product API; pick
tested code for local style. Flag debt.

## Rule 8 — Tests Verify Intent

Write a failing test first for every bug fix. When changing route/path logic,
run `bun run test:route-sync`. Before claiming done, `bun run test:all` passes.

## Rule 9 — Checkpoint After Significant Steps

Summarize done / verified / left.

## Rule 10 — Match Conventions

Inside codebase: local style (4 spaces, single quotes, short plain comments).
For user-facing API and docs: public architecture terminology. Never mention
other frameworks in code or comments.

## Rule 11 — Fail Loud

Do not claim done if skipped silently. Invalid configuration is a startup
error, never a silent skip.

## Rule 12 — Bun First (not Bun-only)

Prefer Bun APIs. Core stays WinterCG-portable behind adapters. Node 24+ / edge
supported where practical.

## Rule 13 — Architecture Wins

Do not reintroduce: middleware layer/type, group inheritance, lowercase schema
method objects as the primary pattern, `BurgerRequest` as a public type,
lifecycle hook named `provide`, route-level `use.ts` as the plugin system,
first-class `webhook.ts`, `Burger.use`, CLI `serve`, or auth under
`ecosystem/hooks/`.

## Code Conventions

### Routing

- Dynamic: `[paramName]` → `ctx.params`
- Wildcard: `[...]` → `ctx.wildcardParams` (named `[...slug]` is an error)
- Groups: `(name)`: URL only, **no file inheritance**
- Specificity: static > `:param` > wildcard (HTTP and WebSocket alike)

### Route template

```typescript
// route.ts
export async function GET(ctx: BurgerContext): Promise<Response> {
    return Response.json({ ok: true });
}

// schema.ts
export const GET = { query: z.object({ q: z.string().optional() }) };
export const POST = { body: z.object({ name: z.string() }) };

// openapi.ts
export const GET = { summary: '...', tags: ['users'] };

// config.ts
export default { auth: false };
export const POST = { auth: true };

// hooks.ts
export const beforeRoute = async (ctx: BurgerContext) => {
    /* ... */
};
```

### Types

- `BurgerContext`: public request lifecycle object
- Augmentation points: `BurgerContext`, `BurgerServices`, `BurgerAuthUser`
  (`declare module 'burger-api'`, usually in `src/types.ts`)
- `RouteConfig` for `config.ts` (`satisfies RouteConfig`)
- Errors: `HTTPError`, `ValidationError`, `NotFoundError`,
  `UnauthorizedError`, `ForbiddenError`, `MethodNotAllowedError`

### Imports (user projects)

```typescript
import { Burger } from 'burger-api';
import type { BurgerContext } from 'burger-api';
```

### Examples: convention file separation

When creating or migrating examples, **each route directory must use separate
convention files**. Never co-locate schema/openapi/hooks/config exports inside
`route.ts`; the scanner discovers them by filename.

```
src/api/products/
 route.ts   # handler ONLY: export async function GET(ctx) { ... }
 schema.ts  # export const GET = { body, query, params }
 openapi.ts # export const GET = { summary, tags, operationId }
 hooks.ts   # export const beforeRoute = [...]
 config.ts  # export default { auth: false }
```

If a route has no schema/openapi/hooks/config, omit those files. Do not put
empty stubs in `route.ts`.

**App-level convention files** must also be separate (see the app files list
above). Never inline `burger.usePlugin()` or `burger.provide()` calls in
`index.ts`: put them in `plugins.ts` and `providers.ts`.

## Performance

Performance is a top priority. Resolve work at compile/startup time; add no
per-request cost to normal requests (no per-request lookups, closures or
allocations that can be precomputed). Use plain `for` loops in hot paths.
AOT routes, static dispatch, compiled hook plans, small footprint. Measure
before and after in `burger-api-benchmarks` (`bun run battle`,
`bun run overhead`) after rebuilding `packages/burger-api`.
