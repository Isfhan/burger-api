# Cache Control Middleware

HTTP caching middleware for burger-api framework. This middleware sets Cache-Control and related headers to control how responses are cached by browsers, CDNs, and proxy servers.

## Features

- ✅ Flexible Cache-Control directives
- ✅ Browser and CDN cache control
- ✅ ETag generation for conditional requests
- ✅ Vary header support
- ✅ Preset configurations
- ✅ Immutable asset caching

## Installation

Copy this middleware into your project:

```bash
# Using the burger-api CLI (coming soon)
burger-api add cache

# Or manually copy the cache.ts file to your middleware folder
```

## Usage

### Basic Usage (No Caching)

```typescript
import { Burger } from 'burger-api';
import { noCache } from './middleware/cache/cache';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        noCache() // Prevent all caching
    ]
});

app.serve(3000);
```

### Public Cache (1 hour)

```typescript
import { publicCache } from './middleware/cache/cache';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        publicCache(3600) // Cache for 1 hour
    ]
});
```

### Private Cache (User-Specific Data)

```typescript
import { privateCache } from './middleware/cache/cache';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        privateCache(300) // Cache privately for 5 minutes
    ]
});
```

### Immutable Assets

```typescript
import { immutableCache } from './middleware/cache/cache';

// For static assets with content-based filenames (e.g., app.a1b2c3d4.js)
const assetCache = immutableCache(); // Cache for 1 year, immutable
```

### CDN Cache

```typescript
import { cdnCache } from './middleware/cache/cache';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cdnCache(300, 3600) // Browser: 5 min, CDN: 1 hour
    ]
});
```

### Custom Configuration

```typescript
import { cacheControl } from './middleware/cache/cache';

const customCache = cacheControl({
    directive: 'public',
    maxAge: 3600,
    sMaxAge: 7200,
    mustRevalidate: true,
    vary: ['Accept-Encoding', 'Accept']
});
```

## Configuration Options

### `directive`

- **Type**: `'public' | 'private' | 'no-cache' | 'no-store' | 'must-revalidate'`
- **Default**: `'no-cache'`

Main cache directive:
- `public`: Can be cached by any cache
- `private`: Only browser can cache (not CDNs)
- `no-cache`: Must revalidate before using cached copy
- `no-store`: Never cache
- `must-revalidate`: Must revalidate when stale

### `maxAge`

- **Type**: `number`
- **Default**: `undefined`

Maximum age in seconds for browser cache.

### `sMaxAge`

- **Type**: `number`
- **Default**: `undefined`

Maximum age in seconds for shared caches (CDNs). Overrides `maxAge` for CDNs.

### `mustRevalidate`

- **Type**: `boolean`
- **Default**: `false`

Cache must revalidate with server when stale.

### `immutable`

- **Type**: `boolean`
- **Default**: `false`

Content will never change. Perfect for versioned assets.

### `custom`

- **Type**: `string`
- **Default**: `undefined`

Custom Cache-Control value. Overrides all other options.

### `etag`

- **Type**: `boolean`
- **Default**: `false`

Generate ETag header for conditional requests.

### `vary`

- **Type**: `string | string[]`
- **Default**: `undefined`

Vary header value. Specifies which request headers affect the cached response.

## Preset Configurations

### `noCache()`

```typescript
// Completely disable caching
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
```

### `publicCache(maxAge)`

```typescript
// Public cache for specified duration
Cache-Control: public, max-age=3600
```

### `privateCache(maxAge)`

```typescript
// Private cache with revalidation
Cache-Control: private, max-age=300, must-revalidate
```

### `immutableCache()`

```typescript
// Immutable assets (1 year)
Cache-Control: public, max-age=31536000, immutable
```

### `cdnCache(browserMaxAge, cdnMaxAge)`

```typescript
// Different cache times for browser and CDN
Cache-Control: public, max-age=300, s-maxage=3600, must-revalidate
```

## Advanced Examples

### Route-Specific Caching

```typescript
// api/products/route.ts - Cache product list
import { publicCache } from '../../middleware/cache/cache';
import type { BurgerRequest } from 'burger-api';

export const middleware = [publicCache(600)]; // 10 minutes

export async function GET(req: BurgerRequest) {
    const products = await db.getProducts();
    return Response.json({ products });
}
```

```typescript
// api/users/profile/route.ts - Don't cache user data
import { noCache } from '../../../middleware/cache/cache';
import type { BurgerRequest } from 'burger-api';

export const middleware = [noCache()];

export async function GET(req: BurgerRequest) {
    const user = await getUserFromToken(req);
    return Response.json({ user });
}
```
```

### Content-Based Caching

```typescript
import { cacheControl } from './middleware/cache/cache';

// Different caching based on content type
handlers: {
    GET: async (req) => {
        const data = await fetchData();
        
        // Apply different cache rules based on data
        const headers = new Headers();
        
        if (data.isStatic) {
            headers.set('Cache-Control', 'public, max-age=86400'); // 1 day
        } else if (data.isUserSpecific) {
            headers.set('Cache-Control', 'private, max-age=300'); // 5 min
        } else {
            headers.set('Cache-Control', 'no-cache');
        }
        
        return new Response(JSON.stringify(data), { headers });
    }
}
```

### With Vary Header

```typescript
import { cacheControl } from './middleware/cache/cache';

// Cache varies by Accept and Authorization headers
const apiCache = cacheControl({
    directive: 'private',
    maxAge: 300,
    vary: ['Accept', 'Authorization']
});
```

### Conditional Requests with ETag

```typescript
import { cacheControl } from './middleware/cache/cache';

const cacheWithETag = cacheControl({
    directive: 'public',
    maxAge: 3600,
    etag: true // Generate ETag
});

// Client can then use If-None-Match header
// Server returns 304 Not Modified if content unchanged
```

### Environment-Specific Caching

```typescript
import { noCache, publicCache } from './middleware/cache/cache';

const cacheMiddleware = process.env.NODE_ENV === 'production'
    ? publicCache(3600)  // 1 hour in production
    : noCache();          // No cache in development
```

## Common Caching Strategies

### API Responses

```typescript
// Short-lived, revalidate often
cacheControl({
    directive: 'public',
    maxAge: 60,
    mustRevalidate: true
})
```

### User-Specific Data

```typescript
// Private, short duration
privateCache(300) // 5 minutes
```

### Static Public Data

```typescript
// Public, longer duration
publicCache(3600) // 1 hour
```

### Versioned Assets (CSS, JS)

```typescript
// Long-lived, immutable
immutableCache() // 1 year
```

### Real-Time Data

```typescript
// Don't cache at all
noCache()
```

## Cache Headers Reference

### Cache-Control Directives

| Directive | Meaning |
|-----------|---------|
| `public` | Can be cached by any cache (browser, CDN, proxy) |
| `private` | Only browser can cache |
| `no-cache` | Must revalidate before using cached copy |
| `no-store` | Never cache |
| `max-age=N` | Fresh for N seconds |
| `s-maxage=N` | Override max-age for shared caches (CDNs) |
| `must-revalidate` | Must revalidate when stale |
| `proxy-revalidate` | Like must-revalidate but for proxies only |
| `immutable` | Content will never change |
| `no-transform` | Intermediaries can't modify response |

### ETag Header

```http
ETag: "a1b2c3d4e5f6"
```

Client includes in subsequent requests:
```http
If-None-Match: "a1b2c3d4e5f6"
```

Server returns `304 Not Modified` if content unchanged.

### Vary Header

```http
Vary: Accept-Encoding, Accept
```

Tells caches to key responses by these request headers.

## Best Practices

### 1. Default to No Cache for APIs

```typescript
// Start with no caching
const app = new Burger({
    globalMiddleware: [noCache()]
});

// Then add caching to specific routes
```

### 2. Use Appropriate Cache Duration

- User data: 0-5 minutes
- Public data (frequent updates): 5-15 minutes  
- Public data (rare updates): 1-24 hours
- Static assets (versioned): 1 year

### 3. Leverage CDN Caching

```typescript
cdnCache(300, 3600)
// Browsers: 5 min, CDN: 1 hour
// Balance between freshness and CDN efficiency
```

### 4. Add Vary Header When Needed

```typescript
cacheControl({
    directive: 'public',
    maxAge: 3600,
    vary: ['Accept-Encoding'] // Cache different compressed versions
})
```

### 5. Use ETags for Large Responses

```typescript
cacheControl({
    directive: 'public',
    maxAge: 600,
    etag: true // Enable conditional requests
})
```

## Testing

### Check Cache Headers

```bash
curl -I http://localhost:3000/api/data

# Look for:
# Cache-Control: public, max-age=3600
# ETag: "a1b2c3d4"
# Vary: Accept-Encoding
```

### Test Conditional Requests

```bash
# First request
ETAG=$(curl -I http://localhost:3000/api/data | grep -i etag | cut -d' ' -f2)

# Second request with If-None-Match
curl -I http://localhost:3000/api/data \
  -H "If-None-Match: $ETAG"

# Should return 304 Not Modified if unchanged
```

## Performance Impact

### Benefits

- ✅ Reduced server load
- ✅ Faster page loads
- ✅ Lower bandwidth usage
- ✅ Better scalability

### Considerations

- ⚠️ Stale data risk
- ⚠️ Cache invalidation complexity
- ⚠️ Storage at CDN/browser

## Troubleshooting

### Cache Not Working

1. Check Cache-Control header is set
2. Verify HTTPS (some caches only work on HTTPS)
3. Check for conflicting headers
4. Test with browser dev tools (Network tab)

### Content Not Updating

1. Clear cache manually
2. Reduce max-age
3. Add cache-busting query param
4. Use versioned URLs for static assets

## References

- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
- [MDN: ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
- [HTTP Caching Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)

