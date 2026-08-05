# Burger API Hook Collection

A collection of production-ready hook factories for BurgerAPI 1.0. Each factory
returns a hook function that you wire into a `hooks.ts` array — the app-level
`src/hooks.ts` or a route-level `api/**/hooks.ts`:

```typescript
export const beforeRoute = [logger(), cors()];
```

Hook functions receive the `BurgerContext` and drive the request lifecycle.
There is no separate pipeline layer — hooks are the lifecycle, and each factory
plugs into the hook point it is designed for.

## Available Hook Factories

| Factory                                             | Hook point     | Description                          |
| --------------------------------------------------- | -------------- | ------------------------------------ |
| [**CORS**](./cors/) `cors(options)`                 | `onRequest`    | Cross-Origin Resource Sharing        |
| [**Rate Limiter**](./rate-limiter/) `rateLimit(options)` | `beforeRoute` | Request rate limiting           |
| [**Logger**](./logger/) `logger()` / `createLogger(options)` | `beforeRoute` | Request/response logging |
| [**Compression**](./compression/) `compress(options)` | `beforeRoute` | Response compression (gzip/deflate) |
| [**Security Headers**](./security-headers/) `securityHeaders()` / `strictSecurity()` / `relaxedSecurity()` | `beforeRoute` | Security HTTP headers |
| [**Timeout**](./timeout/) `requestTimeout(options)` | `beforeRoute`  | Detect slow requests                 |
| [**Cache Control**](./cache/) `cacheControl()` / `noCache()` / `publicCache()` / `privateCache()` / `immutableCache()` / `cdnCache()` | `beforeRoute` | HTTP caching headers |
| [**Body Size Limiter**](./body-size-limiter/) `bodySizeLimiter(options)` | `beforeRoute` | Request body size limits |

## Quick Start

### Prerequisites

This collection requires **Bun.js v1.3.1+** and the BurgerAPI framework:

```bash
# Install Bun v1.3.1+ (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version  # Should show v1.3.1 or higher

# Install burger-api in your project
bun add burger-api
```

### Installation

Use the CLI to copy a factory into your project's `ecosystem/hooks/`:

```bash
burger-api add cors
burger-api add rate-limiter
burger-api list
```

Or copy folders manually:

```bash
cp -r burger-api/ecosystem/hooks ./ecosystem/
```

### Basic Usage

Wire the returned hook functions into `src/hooks.ts` (global, applies to every
request) or a route's `hooks.ts` (applies to that route only):

```typescript
// src/hooks.ts — global hooks
import { logger } from '../ecosystem/hooks/logger/logger';
import { cors } from '../ecosystem/hooks/cors/cors';
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

// CORS runs pre-routing so it can answer OPTIONS preflight requests.
export const onRequest = [
    cors({ origin: '*', debug: true }),
];

export const beforeRoute = [
    logger(),
    rateLimit({ windowMs: 60000, maxRequests: 100 }),
];
```

### Run Your Application

```bash
bun run index.ts        # or
bun --watch index.ts    # hot reload
```

## Understanding the Hook Lifecycle

### The 6 Hook Points

| Hook | Stage | Purpose |
|------|-------|---------|
| `onRequest` | Request | Runs before routing — request IDs, tracing, CORS preflight. App-level only. |
| `transform` | Request | Computes values onto the context (replaces `provide`) — an object keyed by field name, not an array. |
| `beforeRoute` | Request | Pre-handler logic — auth, authorization, rate limiting, body checks. |
| `afterRoute` | Response | Runs after the handler — response modification, audit logging. |
| `mapResponse` | Response | Final response decoration — headers, cookies, security headers, compression. |
| `onError` | Error | Catches errors from any lifecycle stage. |

### Lifecycle Order

```
onRequest → Routing → transform → Validation → beforeRoute
 → Handler → afterRoute → mapResponse → Response
```

Error at any point → `onError`. Scopes run Framework → Plugin → Global → Route
(response/error hooks run reversed).

### What a Hook Function Can Return

Every hook function receives `(ctx: BurgerContext)` and controls the pipeline
through its return value:

- **`undefined`** — continue to the next hook or the handler.
- **`Response`** — short-circuit: stop the pipeline and send this response
  (used by `beforeRoute` for rejections such as 401/429/413).
- **`(response: Response) => Response`** — continue, but transform the final
  response after the handler runs (used by response-decoration hooks such as
  compression and security headers).

### Wiring Per Factory

| Factory | Plug into | Why |
|---------|-----------|-----|
| `cors()` | `onRequest` | Must run pre-routing to answer `OPTIONS` preflight before route matching; also adds CORS headers to the response. |
| `logger()` / `createLogger()` | `beforeRoute` | Logs the request, then transforms the response with status/duration. |
| `rateLimit()` | `beforeRoute` | Blocks requests over the limit before the handler runs (429). |
| `compress()` | `beforeRoute` | Returns a response transform that compresses the body after the handler. |
| `securityHeaders()` / `strictSecurity()` / `relaxedSecurity()` | `beforeRoute` | Adds security headers to the response via a transform. |
| `requestTimeout()` | `beforeRoute` | Times the handler and replaces slow responses (408). |
| `cacheControl()` / `noCache()` / `publicCache()` / `privateCache()` / `immutableCache()` / `cdnCache()` | `beforeRoute` | Sets `Cache-Control` on the response via a transform. |
| `bodySizeLimiter()` | `beforeRoute` | Rejects oversized bodies before the handler (413). |

`cors()` is the only factory that belongs in `onRequest`. The response
decoration factories (`compress`, `securityHeaders`, cache, `logger`,
`rateLimit`) may also be wired into `afterRoute` / `mapResponse` if you prefer
to run them after the handler — their returned functions follow the
same transform contract.

### Common Patterns

#### Global Hooks

```typescript
// src/hooks.ts
export const beforeRoute = [logger(), securityHeaders()];
```

#### Route-Specific Hooks

```typescript
// src/api/admin/hooks.ts
export const beforeRoute = [
    rateLimit({ windowMs: 60000, maxRequests: 10 }),
];
```

#### Conditional Hooks

```typescript
// src/hooks.ts
export const beforeRoute = [
    logger(),
    ...(process.env.NODE_ENV === 'production'
        ? [rateLimit({ windowMs: 60000, maxRequests: 100 })]
        : []),
];
```

#### Environment-Based Configuration

```typescript
// src/hooks.ts
const isDev = process.env.NODE_ENV === 'development';

export const beforeRoute = [
    logger({ colors: isDev }),
    cors({
        origin: isDev ? '*' : process.env.ALLOWED_ORIGINS!.split(','),
    }),
    compress({ threshold: 1024 }),
    isDev ? relaxedSecurity() : strictSecurity(),
    rateLimit({
        windowMs: 60000,
        maxRequests: isDev ? 1000 : 100,
    }),
    requestTimeout({ ms: 30000 }),
    bodySizeLimiter({ maxSize: 1024 * 1024 }),
];
```

> Authentication is handled by ecosystem **plugins** (`ecosystem/plugins/`),
> not hooks — hooks control request execution, plugins extend the app.

## Best Practices

### 1. Order Hooks by Cost and Failure Severity

Put cheap, high-impact checks first in the `beforeRoute` array — order is
preserved:

```typescript
export const beforeRoute = [
    requestTimeout(),       // Fast: times the handler
    bodySizeLimiter(),      // Fast: checks Content-Length
    rateLimit(),            // Fast: map lookup
    logger(),               // Medium: logs
    securityHeaders(),      // Fast: header transform
    compress(),             // Medium: compresses
];
```

### 2. Use Compression

```typescript
compress({ threshold: 1024, encodings: ['gzip', 'deflate'] });
```

### 3. Leverage Caching

```typescript
import { publicCache, cdnCache, noCache } from '../ecosystem/hooks/cache/cache';

export const beforeRoute = [
    publicCache(3600),        // Cache-Control: public, max-age=3600
    noCache(),                // For dynamic/private endpoints
];

// CDN with different browser/CDN durations:
// cdnCache(300, 3600); // Browser: 5 min, CDN: 1 hour
```

### 4. Set Timeouts

```typescript
requestTimeout({ ms: 30000 }); // Detect slow requests
```

### 5. Protect Sensitive Endpoints

Use route-level `hooks.ts` for stricter rules than the global defaults.

## Creating Custom Hooks

A custom hook is just a factory that returns a function taking
`BurgerContext`. Type custom context properties via module augmentation:

```typescript
import type { BurgerContext } from 'burger-api';

declare module 'burger-api' {
    interface BurgerContext {
        requestId: string;
    }
}

export interface RequestIdOptions {
    header?: string;
}

export function requestId(options: RequestIdOptions = {}): (ctx: BurgerContext) => unknown {
    const { header = 'X-Request-ID' } = options;

    return (ctx: BurgerContext) => {
        ctx.requestId = ctx.headers.get(header) ?? crypto.randomUUID();
    };
}
```

Wire it like any factory:

```typescript
// src/hooks.ts
import { requestId } from '../ecosystem/hooks/request-id/request-id';

export const onRequest = [requestId()];
```

### Short-Circuit Example (beforeRoute)

```typescript
import type { BurgerContext } from 'burger-api';

export function requireHeader(name: string): (ctx: BurgerContext) => unknown {
    return (ctx: BurgerContext) => {
        if (!ctx.headers.get(name)) {
            return Response.json({ error: `Missing header: ${name}` }, { status: 400 });
        }
    };
}
```

### Response Transform Example (mapResponse)

```typescript
import type { BurgerContext } from 'burger-api';

export function poweredBy(value: string): (ctx: BurgerContext) => unknown {
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

### Reusable Factories with `Burger.macro()`

`Burger.macro()` registers a reusable hook factory that composes any hook
points into one named unit:

```typescript
// src/plugins.ts
import { Burger } from 'burger-api';
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

const burger = new Burger();

burger.macro('strictLimits', (maxRequests: number) => ({
    beforeRoute: [rateLimit({ windowMs: 60000, maxRequests })],
}));
```

## Testing

For a step-by-step manual testing guide (curl commands, expected results, and
an automated test script), see **[TESTING.md](./TESTING.md)**. Automated smoke
coverage lives in the main repo: `bun run test:all`.

## CLI Tool

```bash
# Easy hook installation
burger-api add cors
burger-api add rate-limiter
burger-api add logger

# List available ecosystem components
burger-api list
```

## Contributing

Each hook lives in its own folder under `ecosystem/hooks/`. Guidelines:

1. One hook per folder (kebab-case).
2. Include a `.ts` file exporting the factory (a function that returns a hook
   function taking `BurgerContext`).
3. Include a `README.md` with: description, features, installation, usage
   examples, configuration options, advanced examples, security notes.
4. Hook functions receive only `BurgerContext` — the public context type for
   all hooks.

## License

MIT License — feel free to use these hooks in your projects.
