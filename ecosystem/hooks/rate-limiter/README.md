# Rate Limiter Hook

Limits each client to a number of requests per time window using an in-memory
counter. Over-limit requests get `429 Too Many Requests`.

## Features

- Per-client counters keyed by socket IP, API key, or a custom key
- `X-RateLimit-*` headers on responses and `Retry-After` on `429`
- Skip failed or successful requests
- Custom `429` handler

## Installation

```bash
burger-api add rate-limiter
```

## Usage

Recommended stage: `onRequest`. It runs before routing, so unknown paths
(`404`s) and pages are limited too, and the `429` is sent before any route
work. `beforeRoute` (global or a route's `hooks.ts`) also works when you only
want to limit matched routes.

```typescript
// src/hooks.ts
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

export const onRequest = [
    rateLimit(), // 100 requests per minute per client
];
```

### Custom limits

```typescript
export const onRequest = [
    rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
];
```

### Limit by API key

```typescript
export const onRequest = [
    rateLimit({
        keyGenerator: (ctx) =>
            ctx.headers.get('X-API-Key') || ctx.ip || 'anonymous',
    }),
];
```

### Route-specific limit

```typescript
// src/api/auth/login/hooks.ts
import { rateLimit } from '../../../../ecosystem/hooks/rate-limiter/rate-limiter';

export const beforeRoute = [
    rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 5 }),
];
```

### Custom `429` response

```typescript
export const onRequest = [
    rateLimit({
        handler: () =>
            Response.json(
                { error: 'Rate limit exceeded', retryAfter: 60 },
                { status: 429 }
            ),
    }),
];
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `windowMs` | `number` | `60000` | Window length in milliseconds |
| `maxRequests` | `number` | `100` | Requests allowed per window |
| `keyGenerator` | `(ctx) => string` | client IP | Build the client key |
| `trustProxy` | `boolean` | `false` | Use `X-Forwarded-For` / `X-Real-IP` for the key |
| `handler` | `(ctx) => Response` | JSON `429` | Response when the limit is exceeded |
| `skipFailedRequests` | `boolean` | `false` | Do not count `4xx`/`5xx` responses |
| `skipSuccessfulRequests` | `boolean` | `false` | Do not count `2xx` responses |

## How clients are identified

| Setup | Key used |
|-------|----------|
| Default | `ctx.ip`, the socket peer address |
| `trustProxy: true` | First `X-Forwarded-For` entry, then `X-Real-IP`, then `ctx.ip` |
| `keyGenerator` given | Whatever it returns |
| No identity available | One shared bucket for all such requests, with a one-time warning |

Behind a reverse proxy, `ctx.ip` is the proxy's address, so every client
shares one bucket. Set `trustProxy: true` only when the proxy overwrites
`X-Forwarded-For` on every request; otherwise clients can spoof the header to
bypass the limit.

Keys are hashed with SHA-256 before they are stored.

## Response headers

Every response that passes through the hook carries `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `X-RateLimit-Reset` (a Unix timestamp in
seconds). A `429` also carries `Retry-After`.

## Notes

- The store is in memory: counters reset on restart and each server instance
  has its own counters. Use a shared store (Redis, database) for multiple
  instances.
- Expired records are cleaned up every minute; memory still grows with the
  number of unique clients.
- Combine with an auth plugin for keys that do not depend on IP.