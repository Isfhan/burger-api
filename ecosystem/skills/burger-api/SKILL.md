---
name: burger-api
description: Build APIs with BurgerAPI — Bun-first, file-based routing, Standard Schema validation, hook lifecycle, plugins/providers, OpenAPI. Use when creating routes, schema.ts, hooks, config.ts, plugins, or CLI workflows.
---

# BurgerAPI Development Skill

**Source of truth:** Docs: [burger-api.com/docs](https://burger-api.com/docs)

## Overview

BurgerAPI is a Bun-first, WinterCG-compatible TypeScript framework:

- File-based routing (route = directory of sibling files)
- **Hooks** = request lifecycle
- **Plugins** = application extensions
- Standard Schema validation (Zod default)
- OpenAPI generation
- Handlers return standard Web `Response`
- Public context type: **`BurgerContext`**

## Target project structure

```
burger.build.ts              # build-time only
src/
  index.ts
  plugins.ts                 # register plugins
  providers.ts               # declare shared services → ctx.services
  hooks.ts                   # global hooks
  types.ts                   # app-wide type extensions (TS projects)
  api/<path>/
    route.ts
    schema.ts
    hooks.ts
    openapi.ts
    config.ts
ecosystem/
  hooks/
  plugins/
  skills/
```

Route directories are **self-contained** (no parent/group inheritance).  
Groups `(name)` only strip from the URL.

### Route convention files (first-class)

| File | Role |
|------|------|
| `route.ts` | `export async function GET(ctx: BurgerContext)`; with a schema, `defineRoute(GetSchema, (ctx) => …)` types `ctx.validated` |
| `schema.ts` | `export const GET = { body, query, params, ... }` |
| `hooks.ts` | Route hooks |
| `openapi.ts` | `export const GET = { summary, tags, ... }` |
| `config.ts` | Route options (auth, cache, timeout, …) |

Per-method named exports (`GET`, `POST`, …) on route/schema/openapi.

`config.ts` can also override per method: `export default { auth: false }`
plus `export const POST = { auth: { required: true } }` — each method gets a
shallow merge of default + its own export (method keys win).

## Quick start

```ts
import { Burger } from "burger-api";

const app = new Burger({
  apiDir: "./src/api",
  apiPrefix: "/api",
  title: "My API",
  version: "1.0.0",
});

await app.serve(4000);
```

## Routing

- Dynamic: `api/users/[id]/route.ts` → `/api/users/:id` → `ctx.params.id`
- Wildcard: `api/files/[...]/route.ts` → `/api/files/*` → `ctx.wildcardParams`
- Priority: static > param > wildcard

```ts
// route.ts
export async function GET(ctx: BurgerContext): Promise<Response> {
  return Response.json({ id: ctx.params.id });
}
```

With a `schema.ts`, wrap the handler in
`defineRoute(GetSchema, (ctx) => …)` to type `ctx.validated` (details in
`references/validation.md`).

## Context (`BurgerContext`)

Handlers and hooks receive `ctx`:

- `ctx.request` — raw `Request`; `ctx.method`, `ctx.url`, `ctx.headers`,
  `ctx.body` (`ctx.json()` / `ctx.text()`)
- `ctx.params` — `[param]` segments; `ctx.wildcardParams` — `[...]` segments
- `ctx.query`, `ctx.cookies` — parsed lazily
- `ctx.validated` — schema-checked data (see Validation)
- `ctx.route` — matched route metadata; `ctx.config` — from `config.ts`
- `ctx.ip` — client socket address, resolved lazily; `undefined` where the
  runtime exposes no client address (the Node adapter reads the socket)
- `ctx.publish(topic, message)` — send to every WS socket subscribed to
  `topic` (Bun only; throws on other runtimes / before `app.serve()`)
- `ctx.set` — response mutations
- `ctx.env` — platform bindings on WinterCG targets
- `ctx.services` — app services; app-scoped, shared and frozen (read only)

## Validation (`schema.ts`)

```ts
export const POST = {
  body: z.object({ name: z.string() }),
  response: { 201: z.object({ id: z.string(), name: z.string() }) },
};
```

- After `transform`, before `beforeRoute`
- Failure: throw `ValidationError` → `onError` → default **422** + RFC 9457

## Hooks (6)

`onRequest` → routing → `transform` → validation → `beforeRoute` → handler → `afterRoute` → `mapResponse`  
Errors → `onError`

Scope order: request hooks run **Framework → Plugin → Global → Route**;
response hooks (`afterRoute` / `mapResponse`) run nearest-first
**Route → Global → Plugin → Framework**; `onError` is nearest-first too.

| Scope | Where |
|-------|--------|
| Global | `src/hooks.ts` |
| Route | `api/**/hooks.ts` |
| Plugin | via plugins |
| Framework | internal |

```ts
// src/hooks.ts
export const onRequest = [/* ... */];
export const onError = (err, ctx) => { /* ... */ };
```

Hook return contracts are enforced at compile time: `ForwardHook`
(`onRequest` / `beforeRoute`) returns `Response` (short-circuit), `undefined`
(continue), or an after-mapper `(res) => Response` applied to the eventual
response; `ResponseHook` (`afterRoute` / `mapResponse`) returns `Response`
(replace), a mapper, or `undefined`; `ErrorHook` (`onError`) returns
`Response` or `undefined`. Anything else fails to typecheck.

Global and plugin `afterRoute` / `mapResponse` run for **every** response:
matched routes, 404s, 405s, auto-OPTIONS, `onError`-rendered errors, pages,
assets, `/docs`, `/openapi.json`. Route-level response hooks run only for
their matched route. `ctx.set.headers` is always defined; array values (and
`set-cookie`) append.

## Plugins vs hooks

- Hooks: when code runs on a request  
- Plugins: extend the app (`src/plugins.ts`)

```ts
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";

export default (burger: PluginRegistrar) => {
  burger.usePlugin(/* official plugin */);
};
```

`PluginRegistrar` exposes only `usePlugin` — not the full `Burger` class
(no `serve`/`fetchHandler`/etc. in autocomplete here; those would re-enter
route compilation if called this early).

## Providers

```ts
// src/providers.ts
import type { ProviderRegistrar } from "burger-api";

export default (burger: ProviderRegistrar) => {
  burger.provide("db", db);
};

// route
const db = ctx.services.db;
```

`ProviderRegistrar` exposes only `provide`, for the same reason.

`ctx.services` is one app-scoped object, shared by every request and frozen:
read from it, never assign. Per-request data belongs in a `transform` hook.

## Auth

Implemented through official **ecosystem plugins** under `ecosystem/plugins/` (JWT, session, API key, basic, OIDC). They use hooks + `config.ts`. Core is auth-agnostic.

```ts
// config.ts
import type { RouteConfig } from "burger-api";

export default {
  auth: false,
  // or { required: true, roles: ["admin"] }
} satisfies RouteConfig;
```

`RouteConfig` declares `responseValidation?: "off" | "dev" | "enforce"`
built in. Other keys (`satisfies` accepts any shape) compile as-is, but
reading them back via `ctx.config.auth` requires augmenting `RouteConfig`:

```ts
declare module "burger-api" {
  interface RouteConfig {
    auth?: boolean | { required?: boolean; roles?: string[] };
  }
}
```

Put app-wide augmentations in `src/types.ts` (scaffolded for TS projects).
For the authenticated user, augment `BurgerAuthUser` (shared by `ctx.user`
and `ws.user`); use `BurgerContext` for your own request-scoped properties.

Per method: the default applies to every method, and an uppercase method
export overrides it for that method only (shallow merge, method wins):

```ts
// config.ts
export default { auth: false };                   // GET stays public
export const POST = { auth: { required: true } }; // POST requires a user
```

With an auth plugin registered, **WebSocket routes are gated too**: a public
WS route needs `config.ts` with `auth: false` under the ws dir — otherwise
the plugin default-denies the upgrade.

## Plugin Development

### Plugin interface

```typescript
interface Plugin {
  name: string;
  hooks?: GlobalHooks; // plugin scope — onRequest is allowed here, unlike route-level RouteHooks
}
```

### Creating a plugin

```typescript
// ecosystem/plugins/my-plugin/my-plugin.ts
import type { Plugin, BurgerContext } from "burger-api";

export function myPlugin(options?: MyPluginOptions): Plugin {
  return {
    name: "my-plugin",
    hooks: {
      transform: {
        myField: (ctx: BurgerContext) => {
          // Transform hook - attaches to context
          return { value: "data" };
        },
      },
      beforeRoute: (ctx: BurgerContext) => {
        // Auth checks, validation, etc.
      },
    },
  };
}
```

### Registering plugins

Register plugins in `src/plugins.ts`:

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { myPlugin } from "./ecosystem/plugins/my-plugin/my-plugin";

export default (burger: PluginRegistrar) => {
  burger.usePlugin(myPlugin({ /* options */ }));
};
```

### Plugin structure

```
ecosystem/plugins/<name>/
├── <name>.ts           # Plugin implementation
├── package.json        # Dependencies + peer deps
├── README.md           # Documentation + usage examples
└── test.ts             # (optional) Tests
```

### Available plugins

- `jwt-auth` — JWT authentication (HS256/HS384/HS512, RS256, ES256)
- `session` — Session management with configurable stores
- `api-key` — API key authentication via headers
- `basic-auth` — HTTP Basic authentication
- `oidc` — OpenID Connect authentication
- `env` — Environment variable validation

## OpenAPI

- `openapi.config.ts` — auto-discovered convention file (metadata, endpoints, docs UI, docs auth)
- Swagger UI is the default docs UI (CDN-based, no npm dependency)
- Built-in docs protection via `docsAuth: { username, password }` — guards `/docs` and `/openapi.json`
- Per-route `openapi.ts` with per-method exports (override auto-generated responses)
- `mapJsonSchema` — validator-agnostic schema conversion (Zod, Valibot, ArkType)
- `/openapi.json`, `/docs` (configurable paths, can be disabled)

## CLI

```bash
burger-api create <name>
burger-api dev | build | start
burger-api add <hook-or-plugin>
burger-api generate route users   # alias: g
burger-api inspect | doctor
burger-api skills install|list|available
burger-api list
```

`burger.build.ts` is build-time only (dirs, prefixes, debug).

## Ecosystem layout

```
ecosystem/hooks/     # cors, logger, rate-limiter, ...
ecosystem/plugins/   # jwt, session, env, ...
ecosystem/skills/
```

## Supported

- **WebSocket:** file-based router under `src/websocket/` (default `wsDir`; `ws.ts`/`hooks.ts`/`config.ts` convention files) plus programmatic `burger.websocket()`; CLI `generate ws <name>`, or opt in at `create` time via the WebSocket-routes prompt. Handlers get `ws.url` / `ws.query` for the upgrade URL, `ws.wildcardParams` mirrors `ctx.wildcardParams`, and HTTP handlers can fan out with `ctx.publish(topic, message)` (Bun; `ws.publish` does not echo to the publishing socket, `ctx.publish` reaches every subscriber). Messages for one socket are delivered in order and only after `open` finished; route matching uses HTTP specificity (static > param > wildcard). `ws.user` shares the `ctx.user` type via `BurgerAuthUser`.

## Legacy names (avoid in new code)

`BurgerRequest`, `Middleware` type, `beforeHandle`/`afterHandle`/`onResponse`, lifecycle `provide`, `globalMiddleware`, `burger.config.ts`, route `use.ts`/`webhook.ts`, lowercase schema `get`/`post` as primary pattern, group inheritance.

Prefer: `BurgerContext`, vision hook names, `burger.build.ts`, `config.ts`, uppercase method exports.

## References

- `references/routing.md`, `validation.md`, `hooks.md`, `openapi.md`, `cli.md` (update if they lag the docs)
