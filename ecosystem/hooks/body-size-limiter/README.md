# Body Size Limiter Hook

Rejects request bodies over a size limit, protecting against oversized-payload
attacks.

## Features

- Configurable size limit (default 1MB)
- Fast header mode and accurate stream mode
- Ready-made presets from 100KB to 50MB
- Custom error responses

## Installation

```bash
burger-api add body-size-limiter
```

## Usage

Recommended stage: `onRequest`. It runs before routing and, more importantly,
before schema body validation, which reads the whole body. A route's
`hooks.ts` has no `onRequest`, so per-route limits use `beforeRoute` with the
default `header` mode.

```typescript
// src/hooks.ts
import { bodySizeLimiter } from '../ecosystem/hooks/body-size-limiter/body-size-limiter';

export const onRequest = [bodySizeLimiter()];
```

### Custom size limit

```typescript
export const onRequest = [
    bodySizeLimiter({ maxSize: 10 * 1024 * 1024 }), // 10MB
];
```

### Presets

```typescript
import {
    smallPayloadLimit,
    mediumPayloadLimit,
    largePayloadLimit,
    extraLargePayloadLimit,
} from '../ecosystem/hooks/body-size-limiter/body-size-limiter';

export const onRequest = [largePayloadLimit()]; // 10MB
```

| Preset | Size |
|--------|------|
| `smallPayloadLimit()` | 100KB |
| `mediumPayloadLimit()` | 1MB |
| `largePayloadLimit()` | 10MB |
| `extraLargePayloadLimit()` | 50MB |

### Custom error response

```typescript
import { bodySizeLimiter, formatBytes } from '../ecosystem/hooks/body-size-limiter/body-size-limiter';

export const onRequest = [
    bodySizeLimiter({
        maxSize: 5 * 1024 * 1024,
        onError: (size, max) =>
            Response.json(
                {
                    error: 'File too large',
                    message: `Upload of ${formatBytes(size)} exceeds the ${formatBytes(max)} limit`,
                },
                { status: 413 }
            ),
    }),
];
```

### Route-specific limit

```typescript
// src/api/upload/hooks.ts
import { bodySizeLimiter } from '../../../ecosystem/hooks/body-size-limiter/body-size-limiter';

export const beforeRoute = [
    bodySizeLimiter({ maxSize: 50 * 1024 * 1024 }), // 50MB
];
```

Global hooks run before route hooks, so a route limit can only be stricter
than the global one, never looser.

## Modes

### `header` (default, fast)

Checks `Content-Length` only. A body sent without a trustworthy
`Content-Length` is rejected with `411 Length Required`; an invalid
`Content-Length` is rejected with `400 Bad Request`.

### `stream` (accurate)

Measures a clone of the body, so validation and the handler still read the
original. If the body was already read before the limiter runs, the hook
warns once and lets the request through, because measuring then protects
nothing. Use `onRequest` with stream mode.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSize` | `number` | `1048576` (1MB) | Maximum body size in bytes |
| `mode` | `'header' \| 'stream'` | `'header'` | How the body is measured |
| `onError` | `(size, maxSize) => Response` | `413` JSON | Response for oversized bodies |
| `includeLimit` | `boolean` | `true` | Include the received/maximum sizes in the default 413 body (`false` omits them) |

`GET`, `HEAD`, `OPTIONS`, and `DELETE` requests are not checked.

Default error body:

```json
{
    "error": "Payload Too Large",
    "message": "Request body exceeds maximum allowed size",
    "received": "2.50MB",
    "maximum": "1.00MB"
}
```

`formatBytes(bytes)` is exported to format sizes in custom handlers.

## Notes

- Header mode trusts `Content-Length`; a client can lie about the size. Use
  stream mode on critical endpoints.
- For very large uploads, prefer chunked uploads over raising the limit.