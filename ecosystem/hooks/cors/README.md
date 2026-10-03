# CORS Hook

Adds Cross-Origin Resource Sharing (CORS) headers and answers `OPTIONS`
preflight requests.

## Features

- Origin allow-list, wildcard, or a custom function
- Automatic `OPTIONS` preflight handling (`204` + CORS headers)
- Credentials, exposed headers, and `max-age` support
- Requested headers filtered against an allow-list
- HTTPS enforcement for production

## Installation

```bash
burger-api add cors
```

## Usage

Wire CORS into the global `src/hooks.ts` at `onRequest`. It must run before
routing so it can answer `OPTIONS` preflight requests. Route-level hooks have
no `onRequest`, so CORS is always a global hook.

```typescript
// src/hooks.ts
import { cors } from '../ecosystem/hooks/cors/cors';

export const onRequest = [
    cors({ origin: '*' }),
];
```

### Allow one or more origins

```typescript
export const onRequest = [
    cors({
        origin: ['https://example.com', 'https://app.example.com'],
        credentials: true,
    }),
];
```

### Custom origin validation

```typescript
export const onRequest = [
    cors({
        // Allow all subdomains of example.com
        origin: (origin) => origin === 'https://example.com' || origin.endsWith('.example.com'),
        credentials: true,
    }),
];
```

### Production configuration

```typescript
const isProduction = process.env.NODE_ENV === 'production';

export const onRequest = [
    cors({
        origin: isProduction ? ['https://example.com'] : '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: ['X-Total-Count'],
        credentials: true,
        maxAge: 86400,
        enforceHttps: isProduction,
        debug: !isProduction,
    }),
];
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `'*' \| string \| string[] \| (origin: string) => boolean` | `'*'` | Allowed origins |
| `methods` | `HttpMethod[]` | `['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']` | `Access-Control-Allow-Methods` |
| `allowedHeaders` | `string[]` | `['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-API-Key']` | Request headers the client may send |
| `exposedHeaders` | `string[]` | `[]` | Response headers the browser may read |
| `credentials` | `boolean` | `false` | Send `Access-Control-Allow-Credentials` |
| `maxAge` | `number` | `600` | Preflight cache duration in seconds |
| `debug` | `boolean` | `false` | Log rejected origins and preflight details |
| `enforceHttps` | `boolean` | `false` | Reject `http://` origins in production |

Origin strings and arrays are matched case-insensitively.

## Behavior

- A request without an `Origin` header gets no CORS headers.
- A rejected origin gets `403` with a JSON body and `Vary: Origin`.
- `credentials: true` with `origin: '*'` throws at startup. Use exact origins.
- `maxAge` must be greater than `0`; it throws at startup otherwise.
- Preflight requests return `204`. Requested headers are filtered against
  `allowedHeaders`; headers not on the list are never echoed back.
- `enforceHttps` only blocks `http://` origins when `NODE_ENV` is
  `production`.
- For normal requests the hook returns a response transform, so the CORS
  headers are added to the handler's response.

CORS headers are added to the responses the hook sees; a global `onRequest`
hook sees every request the app handles.

## References

- [MDN: Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)