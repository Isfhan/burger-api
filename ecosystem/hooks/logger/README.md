# Logger Hook

Logs each request with method, path, status code, duration, and an optional
request ID.

## Features

- Text or JSON output, with optional colors
- Request ID generation (`UUID`) or reuse from a header
- Optional query, header, and body logging
- Custom formatters and log functions
- Skip paths with a string, `RegExp`, or function

## Installation

```bash
burger-api add logger
```

## Usage

The hook returns a response transform, so wire it into `onRequest`. `onRequest`
runs for every request, so the logger also records 404, 405, validation and
`onError` responses, and logs the final status.

```typescript
// src/hooks.ts
import { logger } from '../ecosystem/hooks/logger/logger';

export const onRequest = [logger()];
```

Output:

```
[2026-03-15T10:30:45.123Z] GET /api/users 200 45ms
```

### JSON output

```typescript
import { createLogger } from '../ecosystem/hooks/logger/logger';

export const onRequest = [createLogger({ format: 'json' })];
```

```json
{"timestamp":"2026-03-15T10:30:45.123Z","method":"GET","path":"/api/users","status":200,"duration":45,"requestId":"550e8400-e29b-41d4-a716-446655440000"}
```

### Skip paths

```typescript
// String: skipped when the pathname contains it
export const onRequest = [
    createLogger({ skip: '/health' }),
];

// RegExp: tested against the pathname
export const onRequest = [
    createLogger({ skip: /^\/health/ }),
];

// Function
export const onRequest = [
    createLogger({ skip: (ctx) => ctx.method === 'OPTIONS' }),
];
```

`skip` is matched against the request pathname (`/health`), not the full URL,
so the host, port, and query string never affect it.

### Custom formatter and log function

```typescript
import { createLogger } from '../ecosystem/hooks/logger/logger';

export const onRequest = [
    createLogger({
        formatter: (info) =>
            `[${info.timestamp}] ${info.method} ${info.path} ${info.status} ${info.duration}ms`,
        logFn: (message) => myLogFile.write(message + '\n'),
    }),
];
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `colors` | `boolean` | `true` | Colorize method, status, and duration |
| `logHeaders` | `boolean` | `false` | Include request headers |
| `logQuery` | `boolean` | `false` | Include the query string |
| `logBody` | `boolean` | `false` | Include the JSON body of POST/PUT/PATCH requests |
| `requestId` | `boolean` | `true` | Generate or reuse a request ID |
| `requestIdHeader` | `string` | `'X-Request-ID'` | Header to read an existing request ID from |
| `includeRequestIdInLog` | `boolean` | `true` | Include the request ID in the output |
| `format` | `'text' \| 'json'` | `'text'` | Output format |
| `formatter` | `(info: LogInfo) => string` | format-dependent | Custom message formatter |
| `logFn` | `(message: string) => void` | `console.log` | Custom output function |
| `skip` | `string \| RegExp \| (ctx) => boolean` | - | Skip matching requests |

`LogInfo` fields: `method`, `url`, `path`, `status`, `duration`, `timestamp`,
and optional `requestId`, `headers`, `query`, `body`.

`logBody` clones JSON requests (`ctx.clone()`) before the handler runs and
parses that clone as JSON in the response part of the hook, so the handler can
still read the original body (whether via `ctx.json()` or
`ctx.request.text()`). Logging bodies or headers can expose tokens and
passwords, so use them for debugging only.

The logger copies the request ID onto the context as `ctx.requestId` and types
it through a `declare module 'burger-api'` augmentation, so routes read it
without a cast. Duration is reported in whole milliseconds; on Bun 1.4+ it is
measured with a high-precision timer and falls back to `Date.now()` elsewhere.