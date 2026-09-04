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
| `route.ts` | `export async function GET(ctx: BurgerContext)` |
| `schema.ts` | `export const GET = { body, query, params, ... }` |
| `hooks.ts` | Route hooks |
| `openapi.ts` | `export const GET = { summary, tags, ... }` |
| `config.ts` | Route options (auth, cache, timeout, …) |

Per-method named exports (`GET`, `POST`, …) on route/schema/openapi.

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

## Validation (`schema.ts`)

```ts
export const POST = {
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string(), name: z.string() }),
};
```

- After `transform`, before `beforeRoute`
- Failure: throw `ValidationError` → `onError` → default **422** + RFC 9457

## Hooks (6)

`onRequest` → routing → `transform` → validation → `beforeRoute` → handler → `afterRoute` → `mapResponse`  
Errors → `onError`

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
(`onRequest` / `beforeRoute`) returns `Response` (short-circuit) or
`undefined` (continue); `ResponseHook` (`afterRoute` / `mapResponse`) may
also return `(res) => Response` to transform the response; `ErrorHook`
(`onError`) returns `Response` or `undefined`. Anything else fails to typecheck.

## Plugins vs hooks

- Hooks: when code runs on a request  
- Plugins: extend the app (`src/plugins.ts`)

```ts
// src/plugins.ts
export default (burger) => {
  burger.usePlugin(/* official plugin */);
};
```

## Providers

```ts
// src/providers.ts
export default (burger) => {
  burger.provide("db", db);
};

// route
const db = ctx.services.db;
```

## Auth

Implemented through official **ecosystem plugins** under `ecosystem/plugins/` (JWT, session, API key, basic, OIDC). They use hooks + `config.ts`. Core is auth-agnostic.

```ts
// config.ts
export default { auth: false };
// or { auth: { required: true, roles: ["admin"] } }
```

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
import { myPlugin } from "./ecosystem/plugins/my-plugin/my-plugin";

export default (burger) => {
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
- Built-in docs protection via `docsAuth: { username, password }`
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

- **WebSocket:** file-based router under `src/ws/` (`wsDir`, `ws.ts`/`hooks.ts`/`config.ts` convention files) plus programmatic `burger.websocket()`; CLI `generate ws <name>`

## Legacy names (avoid in new code)

`BurgerRequest`, `Middleware` type, `beforeHandle`/`afterHandle`/`onResponse`, lifecycle `provide`, `globalMiddleware`, `burger.config.ts`, route `use.ts`/`webhook.ts`, lowercase schema `get`/`post` as primary pattern, group inheritance.

Prefer: `BurgerContext`, vision hook names, `burger.build.ts`, `config.ts`, uppercase method exports.

## References

- `references/routing.md`, `validation.md`, `openapi.md`, `cli.md` (update if they lag the docs)
