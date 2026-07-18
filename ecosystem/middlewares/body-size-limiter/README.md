# Body Size Limiter Middleware

Request body size limiting middleware for burger-api framework. Middleware is code that runs around your handler — before and/or after it. This middleware prevents large payload attacks by rejecting requests that exceed a specified size limit.

## Features

- ✅ Configurable size limits
- ✅ Fast header-based checking
- ✅ Accurate stream-based checking
- ✅ Preset configurations
- ✅ Custom error responses
- ✅ Protection against DoS attacks
- ✅ 413 Payload Too Large status code

## Installation

Copy this middleware into your project following the standardized ecosystem structure:

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./

# Create the recommended middleware folder structure
mkdir -p middleware/{global,route-specific,custom}
```

## Usage

### Basic Usage (1MB limit)

```typescript
import { Burger } from 'burger-api';
import { bodySizeLimiter } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        bodySizeLimiter() // Default: 1MB limit
    ]
});

app.serve(4000);
```

### Custom Size Limit

```typescript
import { bodySizeLimiter } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        bodySizeLimiter({
            maxSize: 10 * 1024 * 1024 // 10MB limit
        })
    ]
});
```

### Using Presets

```typescript
import {
    smallPayloadLimit,
    mediumPayloadLimit,
    largePayloadLimit,
    extraLargePayloadLimit
} from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

// Small (100KB) - for text-based APIs
const app1 = new Burger({
    globalMiddleware: [smallPayloadLimit()]
});

// Medium (1MB) - default
const app2 = new Burger({
    globalMiddleware: [mediumPayloadLimit()]
});

// Large (10MB) - for file uploads
const app3 = new Burger({
    globalMiddleware: [largePayloadLimit()]
});

// Extra Large (50MB) - for large uploads
const app4 = new Burger({
    globalMiddleware: [extraLargePayloadLimit()]
});
```

### Custom Error Response

```typescript
import { bodySizeLimiter, formatBytes } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

const limiter = bodySizeLimiter({
    maxSize: 5 * 1024 * 1024,
    onError: (size, max) => {
        return Response.json(
            {
                error: 'File too large',
                message: `Your upload of ${formatBytes(size)} exceeds the ${formatBytes(max)} limit`,
                suggestion: 'Please compress your file or split it into smaller parts'
            },
            { status: 413 }
        );
    }
});
```

### Route-Specific Limits

```typescript
// api/upload/route.ts
import { bodySizeLimiter } from '../../middleware/body-size-limiter/body-size-limiter';
import type { BurgerRequest } from 'burger-api';

// Higher limit for file upload endpoint
const uploadLimit = bodySizeLimiter({
    maxSize: 50 * 1024 * 1024 // 50MB
});

export const middleware = [uploadLimit];

export async function POST(req: BurgerRequest) {
    // Handle file upload
    return Response.json({ success: true });
}
```
```

## Configuration Options

### `maxSize`

- **Type**: `number`
- **Default**: `1048576` (1MB)

Maximum allowed body size in bytes.

**Common sizes:**
- 100KB: `102400`
- 1MB: `1048576`
- 10MB: `10485760`
- 50MB: `52428800`
- 100MB: `104857600`

### `mode`

- **Type**: `'header' | 'stream'`
- **Default**: `'header'`

Checking mode:
- `header`: Fast, checks Content-Length header only
- `stream`: Accurate, actually reads and measures body (slower)

### `onError`

- **Type**: `(size: number, maxSize: number) => Response`
- **Default**: Returns 413 with JSON error

Custom error handler for oversized requests.

### `includeLimit`

- **Type**: `boolean`
- **Default**: `true`

Whether to include size information in error response.

## Preset Configurations

### `smallPayloadLimit()` - 100KB

For text-based APIs (JSON, form data):

```typescript
smallPayloadLimit()
// maxSize: 100KB
```

### `mediumPayloadLimit()` - 1MB

Default, good for most APIs:

```typescript
mediumPayloadLimit()
// maxSize: 1MB
```

### `largePayloadLimit()` - 10MB

For file uploads (images, documents):

```typescript
largePayloadLimit()
// maxSize: 10MB
```

### `extraLargePayloadLimit()` - 50MB

For large file uploads (videos, archives):

```typescript
extraLargePayloadLimit()
// maxSize: 50MB
```

## Advanced Examples

### Different Limits per Route

```typescript
import { smallPayloadLimit, largePayloadLimit } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

// Global: small limit for APIs
const app = new Burger({
    apiDir: './api',
    globalMiddleware: [smallPayloadLimit()]
});

// Then override for specific routes:
// api/upload/route.ts
export const middleware = [largePayloadLimit()]; // Override with larger limit

export async function POST(req: BurgerRequest) {
    // Upload logic
    return Response.json({ success: true });
}
```

### Conditional Limits Based on User

```typescript
import { bodySizeLimiter } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

function userBasedLimit(): Middleware {
    return async (req: BurgerRequest): Promise<BurgerNext> => {
        // Get user from JWT/session
        const user = (req as any).user;
        
        // Different limits based on user tier
        let maxSize: number;
        if (user.tier === 'premium') {
            maxSize = 50 * 1024 * 1024; // 50MB
        } else if (user.tier === 'pro') {
            maxSize = 10 * 1024 * 1024; // 10MB
        } else {
            maxSize = 1 * 1024 * 1024; // 1MB
        }
        
        return bodySizeLimiter({ maxSize })(req);
    };
}
```

### With File Type Validation

```typescript
import { bodySizeLimiter } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

const uploadLimit = bodySizeLimiter({
    maxSize: 10 * 1024 * 1024,
    onError: (size, max) => {
        // Also check file type in your handler
        return Response.json({
            error: 'Upload rejected',
            size: `${(size / 1024 / 1024).toFixed(2)}MB`,
            limit: `${(max / 1024 / 1024).toFixed(2)}MB`
        }, { status: 413 });
    }
});

// Then in handler
handlers: {
    POST: async (req) => {
        const contentType = req.headers.get('Content-Type');
        
        // Check file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(contentType)) {
            return Response.json(
                { error: 'Invalid file type' },
                { status: 415 }
            );
        }
        
        // Process upload...
    }
}
```

### Logging Rejected Requests

```typescript
import { bodySizeLimiter } from './ecosystem/middlewares/body-size-limiter/body-size-limiter';

const limiter = bodySizeLimiter({
    maxSize: 5 * 1024 * 1024,
    onError: (size, max) => {
        // Log rejected upload
        console.warn('Rejected oversized request:', {
            size: `${(size / 1024 / 1024).toFixed(2)}MB`,
            limit: `${(max / 1024 / 1024).toFixed(2)}MB`,
            timestamp: new Date().toISOString(),
            url: req.url
        });
        
        return Response.json({
            error: 'Payload too large'
        }, { status: 413 });
    }
});
```

## Modes Comparison

### Header Mode (Fast)

- ✅ Very fast (no body reading)
- ✅ Low memory usage
- ❌ Relies on Content-Length header
- ❌ Client can lie about size
- ✅ Recommended for most cases

```typescript
bodySizeLimiter({
    maxSize: 1024 * 1024,
    mode: 'header' // Default
})
```

### Stream Mode (Accurate)

- ✅ Accurate measurement
- ✅ Can't be bypassed
- ❌ Slower (reads body)
- ❌ Higher memory usage
- ✅ Use for critical endpoints

```typescript
bodySizeLimiter({
    maxSize: 1024 * 1024,
    mode: 'stream' // More secure
})
```

## Best Practices

### 1. Set Global Limits

```typescript
// Start with a safe global limit
const app = new Burger({
    globalMiddleware: [mediumPayloadLimit()]
});
```

### 2. Override for Specific Routes

```typescript
// Higher limit for upload endpoints
export default {
    path: '/upload',
    middleware: [largePayloadLimit()],
    handlers: { /* ... */ }
};
```

### 3. Combine with Rate Limiting

```typescript
import { rateLimit } from '../rate-limiter/rate-limiter';
import { bodySizeLimiter } from '../body-size-limiter/body-size-limiter';

// Prevent abuse with both limits
globalMiddleware: [
    rateLimit({ windowMs: 60000, maxRequests: 100 }),
    bodySizeLimiter({ maxSize: 1024 * 1024 })
]
```

### 4. Provide Clear Error Messages

```typescript
bodySizeLimiter({
    maxSize: 5 * 1024 * 1024,
    onError: (size, max) => Response.json({
        error: 'File too large',
        current: formatBytes(size),
        maximum: formatBytes(max),
        suggestion: 'Please use files smaller than 5MB'
    }, { status: 413 })
})
```

### 5. Consider User Experience

```typescript
// Client-side validation before upload
// Check file size on client before sending
const file = fileInput.files[0];
const maxSize = 5 * 1024 * 1024; // 5MB

if (file.size > maxSize) {
    alert(`File too large. Maximum size is ${formatBytes(maxSize)}`);
    return;
}

// Then send to server...
```

## Common Use Cases

### JSON API

```typescript
smallPayloadLimit() // 100KB - JSON payloads
```

### Form Submissions

```typescript
mediumPayloadLimit() // 1MB - forms with some data
```

### Image Uploads

```typescript
largePayloadLimit() // 10MB - images
```

### Video/Large File Uploads

```typescript
extraLargePayloadLimit() // 50MB - videos
```

### Multipart Uploads

For very large files, use chunked uploads:

```typescript
// Each chunk limited to 10MB
largePayloadLimit()

// Client sends file in 10MB chunks
// Server reassembles chunks
```

## Error Responses

### Default Error (1MB limit exceeded)

```json
{
    "error": "Payload Too Large",
    "message": "Request body exceeds maximum allowed size",
    "received": "2.50MB",
    "maximum": "1.00MB"
}
```

### Custom Error

```json
{
    "error": "Upload too large",
    "size": "15MB",
    "limit": "10MB",
    "suggestion": "Please compress or split your file"
}
```

## Security Considerations

### 1. Always Set Limits

Without limits, attackers can:
- Exhaust server memory
- Cause disk space issues
- Trigger DoS conditions

### 2. Use Header Mode Carefully

Header mode trusts Content-Length. For critical endpoints, use stream mode:

```typescript
bodySizeLimiter({
    mode: 'stream' // More secure
})
```

### 3. Combine with Other Security

```typescript
globalMiddleware: [
    rateLimit(), // Prevent rapid requests
    bodySizeLimiter(), // Limit size
    timeout({ ms: 30000 }) // Prevent slow uploads
]
```

## Testing

### Test with curl

```bash
# Generate large file
dd if=/dev/zero of=large.dat bs=1M count=2  # 2MB file

# Test upload
curl -X POST http://localhost:4000/api/upload \
  -H "Content-Type: application/octet-stream" \
  --data-binary @large.dat

# Should return 413 if over limit
```

### Test Content-Length

```bash
# Fake large Content-Length
curl -X POST http://localhost:4000/api/upload \
  -H "Content-Length: 10485760" \
  -d "small data"

# Should be rejected in header mode
```

## Performance Impact

- **Header Mode**: Negligible overhead (~1ms)
- **Stream Mode**: Proportional to body size

## References

- [MDN: 413 Payload Too Large](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413)
- [RFC 7231: HTTP/1.1 Semantics](https://tools.ietf.org/html/rfc7231)

