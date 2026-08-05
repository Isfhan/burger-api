# Compression Hook

HTTP compression hook factory for burger-api framework. Hook factories are code that runs around your handler — before and/or after it. This hook compresses response bodies using gzip, deflate, or brotli compression to reduce bandwidth usage and improve load times.

## Features

- ✅ Multiple compression algorithms (gzip, deflate, brotli)
- ✅ Automatic client capability detection
- ✅ Configurable compression threshold
- ✅ Smart content-type filtering
- ✅ Automatic exclusion of pre-compressed content
- ✅ Only compresses when it reduces size
- ✅ Sets proper Content-Encoding headers
- ✅ Zero configuration required

## Installation

Copy this hook factory into your project following the standardized ecosystem structure:

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./

# Or install via the CLI
burger-api add compression
```

## Usage

### Basic Usage

```typescript
// src/hooks.ts — global hooks, applies to every request
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress() // Compress all responses with defaults
];

// index.ts
import { Burger } from 'burger-api';

const app = new Burger({
    apiDir: './src/api',
});

app.serve(4000);
```

### Custom Threshold

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        threshold: 2048 // Only compress responses larger than 2KB
    })
];
```

### Note: Brotli Support in Bun

**Important**: Bun's `CompressionStream` currently supports `gzip` and `deflate` only. Brotli (`br`) is not yet supported and will be skipped if specified.

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        encodings: ['gzip', 'deflate'] // Bun supports these
    })
];
```

### Compress Specific Content Types

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        contentTypes: [
            'text/html',
            'text/css',
            'text/javascript',
            'application/javascript',
            'application/json',
            'text/xml',
            'application/xml'
        ]
    })
];
```

### Use Regex for Content Types

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        contentTypes: /^(text\/|application\/(json|javascript|xml))/
    })
];
```

### Custom Exclusions

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        excludeContentTypes: [
            'image/',
            'video/',
            'audio/',
            'font/',
            'application/pdf',
            'application/zip'
        ]
    })
];
```

## Configuration Options

### `threshold`

- **Type**: `number`
- **Default**: `1024` (1KB)

Minimum response size in bytes to compress. Responses smaller than this will not be compressed, as the overhead may not be worth it.

**Recommended values:**
- `512`: More aggressive compression
- `1024`: Balanced (default)
- `2048`: Conservative, better for high-CPU scenarios

### `encodings`

- **Type**: `('gzip' | 'deflate' | 'br')[]`
- **Default**: `['gzip', 'deflate']`

Compression algorithms to support, in order of preference. The hook will use the first encoding that the client supports.

**Encoding comparison:**
- **gzip**: Best compatibility, good compression ✅ Supported in Bun
- **deflate**: Similar to gzip, slightly less common ✅ Supported in Bun
- **br** (brotli): Best compression, modern clients only ❌ Not yet supported in Bun

### `contentTypes`

- **Type**: `string[] | RegExp`
- **Default**: `undefined` (compress all)

If specified, only compress responses with matching content types. Use this to be selective about what gets compressed.

**Common compressible types:**
- `text/html`
- `text/css`
- `text/javascript` / `application/javascript`
- `application/json`
- `text/xml` / `application/xml`
- `text/plain`

### `excludeContentTypes`

- **Type**: `string[] | RegExp`
- **Default**: `['image/', 'video/', 'audio/', 'font/']`

Content types to exclude from compression. By default, excludes media types that are already compressed.

**Common pre-compressed types:**
- Images (JPEG, PNG, GIF, WebP)
- Videos (MP4, WebM)
- Audio (MP3, AAC)
- Fonts (WOFF, WOFF2)
- Archives (ZIP, GZIP)

## How It Works

1. **Client Detection**: Checks the `Accept-Encoding` header to see which compression algorithms the client supports.

2. **Encoding Selection**: Selects the first supported encoding from your `encodings` preference list.

3. **Content Filtering**: Checks if the response should be compressed based on:
   - Response has a body
   - Not already compressed
   - Content type matches filters
   - Body size exceeds threshold

4. **Compression**: Compresses the response body using the selected algorithm.

5. **Size Check**: Only uses compressed version if it's actually smaller than the original.

6. **Headers**: Sets appropriate headers:
   - `Content-Encoding`: The compression algorithm used
   - `Vary: Accept-Encoding`: Tells caches to vary by encoding
   - Updates or removes `Content-Length`

## Advanced Examples

### Production Configuration

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        threshold: 1024,
        encodings: ['br', 'gzip', 'deflate'],
        contentTypes: /^(text\/|application\/(json|javascript|xml))/,
        excludeContentTypes: [
            'image/',
            'video/',
            'audio/',
            'font/',
            'application/zip',
            'application/gzip',
            'application/pdf'
        ]
    })
];
```

### API-Only Compression

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        contentTypes: ['application/json'],
        threshold: 512 // Compress smaller JSON responses
    })
];
```

### Route-Specific Compression

```typescript
// src/api/large-data/hooks.ts
import { compress } from '../../ecosystem/hooks/compression/compression';

// Aggressive compression for large data endpoints
export const beforeRoute = [
    compress({
        threshold: 0, // Compress everything
        encodings: ['br', 'gzip'] // Prefer maximum compression
    })
];
```

### Conditional Compression

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = process.env.NODE_ENV === 'production'
    ? [compress()]
    : [];
```

## Performance Considerations

### Compression Ratios

Typical compression ratios for different content types:

- **JSON**: 60-90% reduction
- **HTML**: 60-80% reduction
- **CSS**: 60-80% reduction
- **JavaScript**: 50-70% reduction
- **XML**: 70-90% reduction

### CPU vs Bandwidth Trade-off

Compression uses CPU to save bandwidth. Consider:

- **High CPU costs**: Use higher threshold, fewer encodings
- **High bandwidth costs**: Use lower threshold, prefer brotli
- **CDN in front**: Let CDN handle compression

### Recommendations

```typescript
// Low-traffic, bandwidth-sensitive
compress({
    threshold: 256,
    encodings: ['br', 'gzip']
})

// High-traffic, CPU-sensitive
compress({
    threshold: 2048,
    encodings: ['gzip']
})

// Balanced (recommended)
compress({
    threshold: 1024,
    encodings: ['gzip', 'deflate']
})
```

## Response Headers

### Compressed Response

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Encoding: gzip
Vary: Accept-Encoding
```

### Uncompressed Response

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 1234
```

## Browser Support

### Gzip

✅ All browsers (universal support)

### Deflate

✅ All modern browsers

### Brotli (br)

✅ Chrome 50+
✅ Firefox 44+
✅ Safari 11+
✅ Edge 15+
❌ IE (not supported)
❌ Not yet supported in Bun.js runtime

## Common Issues

### Compression Not Applied

**Possible causes:**
1. Response is below threshold
2. Content type is excluded
3. Client doesn't support compression
4. Response is already compressed

**Solution:**
```typescript
compress({
    threshold: 0, // Lower threshold for testing
    encodings: ['gzip', 'deflate', 'br']
})
```

### Double Compression

If you see garbled output, you might be compressing twice (e.g., CDN + this hook).

**Solution:** Disable this hook's compression and let the CDN handle it, or vice versa.

### Images Still Being Compressed

Ensure your excludeContentTypes includes image MIME types:

```typescript
compress({
    excludeContentTypes: ['image/', 'video/', 'audio/']
})
```

## Testing

Test compression with curl:

```bash
# Request with gzip
curl -H "Accept-Encoding: gzip" http://localhost:4000/api/data -v

# Request with brotli
curl -H "Accept-Encoding: br" http://localhost:4000/api/data -v

# Request without compression
curl http://localhost:4000/api/data -v
```

## Security Notes

- ✅ Compression is safe for most content
- ⚠️ Be aware of BREACH attack for sensitive data (use CSRF tokens)
- ✅ The hook only compresses, never decompresses requests
- ✅ Content-Type is preserved

## References

- [MDN: Content-Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding)
- [Google: Enable Text Compression](https://developers.google.com/speed/docs/insights/EnableCompression)
- [Brotli Compression](https://github.com/google/brotli)

