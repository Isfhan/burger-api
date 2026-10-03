# Cache Control Hook

Sets `Cache-Control` (and optionally `ETag` and `Vary`) headers so browsers,
CDNs, and proxies cache responses correctly.

## Features

- Flexible `Cache-Control` directives
- Separate browser (`max-age`) and CDN (`s-maxage`) durations
- Optional `ETag` with `304 Not Modified` handling
- Optional `Vary` header
- Ready-made presets

## Installation

```bash
burger-api add cache
```

## Usage

The hook returns a response transform, so wire it into `beforeRoute`.

```typescript
// src/hooks.ts
import { noCache } from '../ecosystem/hooks/cache/cache';

export const beforeRoute = [noCache()];
```

### Presets

```typescript
import {
    publicCache,
    privateCache,
    immutableCache,
    cdnCache,
} from '../ecosystem/hooks/cache/cache';

export const beforeRoute = [
    publicCache(3600),   // public, max-age=3600
    privateCache(300),   // private, max-age=300, must-revalidate
    immutableCache(),    // public, max-age=31536000, immutable
    cdnCache(300, 3600), // public, max-age=300, s-maxage=3600, must-revalidate
];
```

| Preset | Header |
|--------|--------|
| `noCache()` | `no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` |
| `publicCache(maxAge = 3600)` | `public, max-age=<maxAge>` |
| `privateCache(maxAge = 300)` | `private, max-age=<maxAge>, must-revalidate` |
| `immutableCache()` | `public, max-age=31536000, immutable` |
| `cdnCache(browserMaxAge = 300, cdnMaxAge = 3600)` | `public, max-age=<browser>, s-maxage=<cdn>, must-revalidate` |

### Custom configuration

```typescript
import { cacheControl } from '../ecosystem/hooks/cache/cache';

export const beforeRoute = [
    cacheControl({
        directive: 'public',
        maxAge: 3600,
        sMaxAge: 7200,
        mustRevalidate: true,
        vary: ['Accept-Encoding', 'Accept'],
    }),
];
```

### Route-level caching

A route-level `beforeRoute` hook runs after the global one, but its response
transform is applied first (forward-hook mappers apply in reverse order), so
a global cache hook sets the final header. Use either a global hook or
route-level hooks, not both, when they disagree:

```typescript
// src/api/products/hooks.ts
import { publicCache } from '../../../ecosystem/hooks/cache/cache';

export const beforeRoute = [publicCache(600)];
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directive` | `'public' \| 'private' \| 'no-cache' \| 'no-store' \| 'must-revalidate'` | `'no-cache'` | Main directive |
| `maxAge` | `number` | - | Browser cache duration in seconds |
| `sMaxAge` | `number` | - | Shared cache (CDN) duration in seconds |
| `mustRevalidate` | `boolean` | `false` | Add `must-revalidate` |
| `proxyRevalidate` | `boolean` | `false` | Add `proxy-revalidate` |
| `immutable` | `boolean` | `false` | Add `immutable` |
| `noTransform` | `boolean` | `false` | Add `no-transform` |
| `custom` | `string` | - | Full `Cache-Control` value; overrides the options above |
| `etag` | `boolean` | `false` | Add an `ETag` and answer `304` |
| `vary` | `string \| string[]` | - | Set the `Vary` header |

## ETag behavior

- `etag: true` only applies to `200` responses to `GET` and `HEAD` requests.
- The tag is a hash of the raw response bytes, so binary bodies are safe.
- A handler-set `ETag` is kept and compared as-is.
- `If-None-Match` is compared using weak comparison per RFC 9110: a `W/`
  prefix is ignored and `*` matches any tag.
- On a match the response is `304 Not Modified` with no body and no
  `Content-Length`.
- `Vary` is set before the `304`, so caches key the response correctly.

## Notes

- `directive: 'must-revalidate'` alone produces `Cache-Control: must-revalidate`.
- This hook sets headers; it does not store responses. A browser or CDN does
  the caching.