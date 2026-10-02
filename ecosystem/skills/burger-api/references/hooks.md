# Hook Pipeline Reference

Hooks are the only request-lifecycle system in BurgerAPI. There is no separate middleware layer — `middleware.ts` is a forbidden file. Infrastructure code (auth, CORS, logging) is written as hooks in `hooks.ts`.

## Return Types

Hook functions can return three values:

| Return | Behavior |
|---|---|
| `undefined` | Continue to the next hook or route handler |
| `Response` | Stop processing and send this response immediately |
| `(response: Response) => Response` | Mapper: transforms the eventual response (forward hooks queue it until the handler has run; response hooks apply it at their stage) |

## Global Hooks (all routes)

Place hooks in the app's root `src/hooks.ts` — they apply to every route:

```typescript
// src/hooks.ts
import { cors } from '../ecosystem/hooks/cors/cors';
import { logger } from '../ecosystem/hooks/logger/logger';
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

export const onRequest = [
    logger(),
    cors({ origin: '*' }),
    rateLimit({ maxRequests: 100, windowMs: 60000 }),
];
```

## Route-Specific Hooks

Place hooks in a route directory's `hooks.ts` — they apply only to that route.
`onRequest` is app/plugin scope only (it runs before a route is even
matched, so it can't be scoped to one route) — declaring it in a route's
`hooks.ts` is a compile error. Use `beforeRoute` for route-scoped logic:

```typescript
// api/protected/hooks.ts
export const beforeRoute = [
    async (ctx: BurgerContext) => {
        const token = ctx.headers.get('Authorization');
        if (!token) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return undefined; // continue
    },
];
```

## After-Hooks

When a hook returns a function, that function transforms the response.
`afterRoute` / `mapResponse` apply theirs at their own stage, in chain order;
forward hooks (`onRequest` / `beforeRoute`) queue theirs until the handler has
run, then apply them in reverse collection order:

```typescript
// api/<route>/hooks.ts
export const afterRoute = [
    async (ctx: BurgerContext) => {
        return (response: Response) => {
            response.headers.set('Access-Control-Allow-Origin', '*');
            return response;
        };
    },
];
```

This pattern is useful for:
- Adding CORS headers to every response
- Logging response status codes
- Transforming response bodies

Global (`src/hooks.ts`) and plugin `afterRoute` / `mapResponse` hooks run for
**every** response the app produces: matched routes, 404s, 405s, auto-OPTIONS,
`onError`-rendered errors, pages, assets, `/docs` and `/openapi.json`.
Route-level response hooks run only for their matched route.

`ctx.set.headers` is always defined (created on first access), so
`ctx.set.headers['x-id'] = value` never throws. Array values append; a scalar
`set-cookie` appends too, so cookies from the handler and from `ctx.set` both
survive.

## Performance

- Each route+method hook plan is JIT-compiled into one specialized function
  (lazily, on first hit); runtimes that forbid dynamic code generation fall
  back to the interpreter.
- The pipeline is sync-first: `await` happens only when a step really returns
  a promise.
- On Bun, `serve()` registers every route as a per-method native Bun route
  (`{ GET, POST, ... }`), so there is no per-request method lookup.

## Ecosystem Hooks

Available via `burger-api add <name>` — these are **hook factories** wired into `hooks.ts`:

| Hook | Description |
|---|---|
| cors | Cross-Origin Resource Sharing |
| logger | Request/response logging |
| rate-limiter | Request rate limiting |
| compression | gzip/deflate response compression |
| security-headers | Security HTTP headers |
| timeout | Request timeout |
| cache | HTTP caching headers |
| body-size-limiter | Request body size limits |

## Ecosystem Plugins

Also available via `burger-api add <name>`, but these are **plugins** (`burger.usePlugin(...)` in `src/plugins.ts`), not hooks — they need app-level registration, not a `hooks.ts` export. Auth in particular is plugin-only in v1: there is no `hooks.ts`-based auth hook.

| Plugin | Description |
|---|---|
| jwt-auth | JWT token authentication |
| api-key | API key authentication |
| basic-auth | HTTP Basic authentication |
| session | Cookie-based session auth |
| oidc | OpenID Connect authentication |
| env | Validates required environment variables on startup |

Auth plugins read `ctx.config.auth` and default-deny unless it is disabled.
`config.ts` can scope that per method — the default applies route-wide and an
uppercase method export overrides it (shallow merge, method wins):

```typescript
// config.ts
export default { auth: false };                   // GET stays public
export const POST = { auth: { required: true } }; // POST requires a user
```

The same plugins gate WebSocket upgrades: a public WS route needs
`config.ts` with `auth: false` under the ws route directory, or the upgrade
is rejected.
