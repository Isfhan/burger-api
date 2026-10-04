# Burger API Hook Collection

Production-ready hook factories for BurgerAPI 1.0. Each factory returns a hook
function that you wire into a `hooks.ts` array: the app-level `src/hooks.ts`
or a route-level `api/**/hooks.ts`.

```typescript
// src/hooks.ts
export const beforeRoute = [logger(), securityHeaders()];
```

Hooks receive the `BurgerContext` and drive the request lifecycle. There is no
separate middleware layer: hooks are the lifecycle.

## Available Hook Factories

| Factory | Hook point | Description |
|---------|------------|-------------|
| [**CORS**](./cors/) `cors(options)` | `onRequest` | Cross-Origin Resource Sharing |
| [**Rate Limiter**](./rate-limiter/) `rateLimit(options)` | `onRequest` / `beforeRoute` | Request rate limiting |
| [**Logger**](./logger/) `logger()` / `createLogger(options)` | `beforeRoute` | Request/response logging |
| [**Compression**](./compression/) `compress(options)` | `beforeRoute` | gzip/deflate response compression |
| [**Security Headers**](./security-headers/) `securityHeaders()` / `strictSecurity()` / `relaxedSecurity()` | `beforeRoute` | Security HTTP headers |
| [**Timeout**](./timeout/) `requestTimeout(options)` | `beforeRoute` | Replace slow responses with `408` |
| [**Cache Control**](./cache/) `cacheControl()` / `noCache()` / `publicCache()` / `privateCache()` / `immutableCache()` / `cdnCache()` | `beforeRoute` | HTTP caching headers |
| [**Body Size Limiter**](./body-size-limiter/) `bodySizeLimiter(options)` | `onRequest` / `beforeRoute` | Request body size limits |

## Quick Start

Requires Bun 1.4.0 or later and the BurgerAPI framework:

```bash
bun add burger-api

# Copy a factory into your project's ecosystem/hooks/
burger-api add cors
burger-api add rate-limiter
```

### Basic Usage

```typescript
// src/hooks.ts
import { logger } from '../ecosystem/hooks/logger/logger';
import { cors } from '../ecosystem/hooks/cors/cors';
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

// CORS runs pre-routing so it can answer OPTIONS preflight requests.
export const onRequest = [cors({ origin: '*' })];

export const beforeRoute = [
    logger(),
    rateLimit({ windowMs: 60000, maxRequests: 100 }),
];
```

## The 6 Hook Points

| Hook | Stage | Purpose |
|------|-------|---------|
| `onRequest` | Request | Runs before routing: request IDs, tracing, CORS preflight. App and plugin scope only. |
| `transform` | Request | Computes values onto the context. An object keyed by field name, not an array. |
| `beforeRoute` | Request | Pre-handler logic: auth, rate limiting, body checks. |
| `afterRoute` | Response | Runs after the handler: response modification, audit logging. |
| `mapResponse` | Response | Final response decoration: headers, cookies, compression. |
| `onError` | Error | Handles errors from any lifecycle stage. |

```
onRequest → Routing → transform → Validation → beforeRoute
 → Handler → afterRoute → mapResponse → Response
```

An error at any point goes to `onError`. Request hooks run Framework →
Plugin → Global → Route; response and error hooks run nearest-first, Route →
Global → Plugin → Framework.

### Hook return values

Every hook receives `(ctx: BurgerContext)`:

- `undefined`: continue to the next hook or the handler.
- `Response`: stop the pipeline and send this response.
- `(response: Response) => Response`: continue, then transform the final
  response. Forward hooks (`onRequest`, `beforeRoute`) queue the mapper until
  the handler has run; mappers apply in reverse collection order.

### Which hook point per factory

- `cors()` must be in `onRequest`: it answers `OPTIONS` preflight before
  route matching, and a route's `hooks.ts` has no `onRequest`.
- `rateLimit()` and `bodySizeLimiter()` belong in `onRequest` when you want
  them to cover unmatched paths and run before body validation. They also
  work in `beforeRoute`.
- `logger()`, `compress()`, `securityHeaders()`, cache presets, and
  `requestTimeout()` return response transforms. Wire them into
  `beforeRoute` so the response they receive is the handler's.

### Common patterns

Global hooks, in `src/hooks.ts`:

```typescript
export const beforeRoute = [logger(), securityHeaders()];
```

Route-specific hooks, in `api/admin/hooks.ts`:

```typescript
// src/api/admin/hooks.ts
import { rateLimit } from '../../../ecosystem/hooks/rate-limiter/rate-limiter';

export const beforeRoute = [
    rateLimit({ windowMs: 60000, maxRequests: 10 }),
];
```

Conditional hooks:

```typescript
export const beforeRoute = [
    logger(),
    ...(process.env.NODE_ENV === 'production'
        ? [rateLimit({ windowMs: 60000, maxRequests: 100 })]
        : []),
];
```

Authentication is handled by ecosystem **plugins**
(`ecosystem/plugins/`), not hooks: hooks control request execution, plugins
extend the app.

## Creating Custom Hooks

A custom hook is a factory that returns a function taking `BurgerContext`.
Type custom context properties with module augmentation:

```typescript
// src/hooks.ts
import type { BurgerContext } from 'burger-api';

declare module 'burger-api' {
    interface BurgerContext {
        requestId: string;
    }
}

export function requestId(): (ctx: BurgerContext) => void {
    return (ctx) => {
        ctx.requestId = ctx.headers.get('X-Request-ID') ?? crypto.randomUUID();
    };
}

export const onRequest = [requestId()];
```

A `beforeRoute` hook can reject a request by returning a `Response`:

```typescript
export function requireHeader(name: string) {
    return (ctx: BurgerContext) => {
        if (!ctx.headers.get(name)) {
            return Response.json({ error: `Missing header: ${name}` }, { status: 400 });
        }
    };
}
```

A response hook returns a mapper:

```typescript
export function poweredBy(value: string) {
    return () => (response: Response): Response => {
        const headers = new Headers(response.headers);
        headers.set('X-Powered-By', value);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    };
}
```

Wire custom hooks the same way as official ones.

## Testing

For a step-by-step manual testing guide (curl commands and expected results),
see [TESTING.md](./TESTING.md). Automated smoke coverage lives in the main
repo: `bun run test:all`.

## CLI

```bash
burger-api add cors
burger-api add rate-limiter
burger-api list
```

## Contributing

Each hook lives in its own kebab-case folder under `ecosystem/hooks/`:

1. One factory per folder, exported from the folder's `.ts` file.
2. Include a `README.md` with description, options, and examples.
3. Hook functions receive `BurgerContext`, the public context type.

## License

MIT