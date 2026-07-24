# Hook Pipeline Reference

Hooks are the only request-lifecycle system in BurgerAPI. There is no separate middleware layer — `middleware.ts` is a forbidden file. Infrastructure code (auth, CORS, logging) is written as hooks in `hooks.ts`.

## Return Types

Hook functions can return three values:

| Return | Behavior |
|---|---|
| `undefined` | Continue to the next hook or route handler |
| `Response` | Stop processing and send this response immediately |
| `(response: Response) => Response` | After-hook: transform the final response after the handler runs |

## Global Hooks (all routes)

Place hooks in the root `api/hooks.ts` — they apply to every route under `api/`:

```typescript
// src/hooks.ts
export const onRequest = [
    logger(),
    cors({ origin: '*' }),
    rateLimiter({ max: 100, window: 60000 }),
];
```

## Route-Specific Hooks

Place hooks in a route directory's `hooks.ts` — they apply only to that route:

```typescript
// api/protected/hooks.ts
export const onRequest = [
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

When a hook returns a function, that function runs after the route handler (and all subsequent after-hooks run in reverse order):

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

## Performance

The hook pipeline has specialized fast paths:
- **0 hooks** — direct handler call, no overhead
- **1 hook** — single function call, no array iteration
- **2 hooks** — manual loop unrolling for JIT optimization
- **3+ hooks** — standard array iteration

Pre-allocated arrays are used to avoid dynamic resizing.

## Ecosystem Hooks

Available via `burger-api add <name>` — these are **hook factories** wired into `hooks.ts`:

| Hook | Description |
|---|---|
| cors | Cross-Origin Resource Sharing |
| logger | Request/response logging |
| rate-limiter | Request rate limiting |
| compression | gzip/deflate response compression |
| security-headers | Security HTTP headers |
| jwt-auth | JWT token authentication |
| api-key-auth | API key authentication |
| timeout | Request timeout |
| cache-control | HTTP caching headers |
| body-size-limiter | Request body size limits |
