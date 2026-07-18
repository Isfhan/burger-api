# Middleware System Reference

Middleware is code that runs around your handler — before and/or after it runs.

## Return Types

Middleware functions can return three values:

| Return | Behavior |
|---|---|
| `undefined` | Continue to the next middleware or route handler |
| `Response` | Stop processing and send this response immediately |
| `(response: Response) => Response` | After-middleware: transform the final response after the handler runs |

## Global Middleware

Applied to every route:

```typescript
const app = new Burger({
    globalMiddleware: [
        logger(),
        cors({ origin: '*' }),
        rateLimiter({ max: 100, window: 60000 }),
    ],
});
```

## Route-Specific Middleware

Applied only to a single route file:

```typescript
// api/protected/route.ts
export const middleware: Middleware[] = [
    async (req) => {
        const token = req.headers.get('Authorization');
        if (!token) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return undefined; // continue
    },
];
```

## After-Middleware

When a middleware returns a function, that function runs after the route handler (and all subsequent after-middlewares run in reverse order):

```typescript
export const middleware: Middleware[] = [
    async (req) => {
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

The middleware request flow (also called a pipeline) has specialized fast paths:
- **0 middleware** — direct handler call, no overhead
- **1 middleware** — single function call, no array iteration
- **2 middleware** — manual loop unrolling for JIT optimization
- **3+ middleware** — standard array iteration

Pre-allocated arrays are used to avoid dynamic resizing.

## Ecosystem Middleware

Available via `burger-api add <name>`:

| Middleware | Description |
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
