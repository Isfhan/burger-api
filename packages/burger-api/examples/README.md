# BurgerAPI Examples

Each example demonstrates one framework feature. All examples use `bun link burger-api` for local development.

## Setup

```bash
# One-time: register the framework for linking
cd packages/burger-api && bun link

# Then in any example:
cd examples/<name> && bun link burger-api
```

## Run an example

```bash
cd examples/<name>
bun run src/index.ts
```

## Run all example tests

```bash
bun run test:examples
```

## Examples

### Core (8)

| Name | Feature |
|------|---------|
| `basic` | Minimal app — single route |
| `basic-js` | Minimal JavaScript app — `.js` routes with JSDoc |
| `routing` | File-based routing, dynamic params, groups |
| `nested-dynamic-routes` | Deeply nested `[userId]/[postId]` params |
| `wildcard-routes` | `[...]` catch-all routes, priority rules |
| `lifecycle-hooks` | All 6 hook points |
| `page-routing` | File-based page routing — HTML and TSX pages |
| `production-app` | Auth, rate limiting, CORS, OpenAPI |

### Validation & Errors (3)

| Name | Feature |
|------|---------|
| `validation` | Zod validation — query, body, params, headers, cookies |
| `validation-advanced` | Coercion, response validation, named models |
| `error-handling` | ValidationError → 422 RFC 9457 |
| `error-classes` | NotFoundError, UnauthorizedError, ForbiddenError |

### OpenAPI (2)

| Name | Feature |
|------|---------|
| `openapi` | OpenAPI spec + Scalar docs UI |
| `openapi-config` | `openapi.config.ts` convention, docs auth, custom metadata |

### Plugins & Providers (2)

| Name | Feature |
|------|---------|
| `plugin` | Plugin system via `src/plugins.ts` convention |
| `providers` | Service injection via `src/providers.ts` convention |

### Framework Methods (2)

| Name | Feature |
|------|---------|
| `macros` | `burger.macro()` reusable hook factories |
| `build-config` | `burger.build.ts` for CLI/AOT production builds |

### Context & CORS (2)

| Name | Feature |
|------|---------|
| `context` | All BurgerContext properties deep dive |
| `cors` | CORS via ecosystem hook |

### Ecosystem (2)

| Name | Feature |
|------|---------|
| `ecosystem-hooks` | All 10 official lifecycle hooks |
| `ecosystem-plugins` | api-key plugin |

### WebSocket (1)

| Name | Feature |
|------|---------|
| `websocket-chat` | WebSocket with hooks, services, config |

### Deploy (3)

| Name | Feature |
|------|---------|
| `deploy-cloudflare` | Cloudflare Workers — `wrangler.toml` + fetch export |
| `deploy-vercel` | Vercel Functions — `vercel.json` + fetch export |
| `deploy-deno` | Deno — `deno serve` fetch export |

## Conventions

- Each example has `src/` with the app code
- Tests live at the example root (`api.test.ts`)
- All imports use `'burger-api'` (via `bun link`)
- Route convention files: `route.ts`, `schema.ts`, `hooks.ts`, `openapi.ts`, `config.ts`
- Application convention files: `index.ts`, `hooks.ts`, `plugins.ts`, `providers.ts`, `openapi.config.ts`
