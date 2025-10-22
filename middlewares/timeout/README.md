# Timeout Middleware

Request timeout middleware for burger-api framework. This middleware aborts requests that exceed a specified time limit, preventing slow requests from tying up server resources.

## Features

- ✅ Configurable timeout duration
- ✅ Clean request abortion
- ✅ Custom error responses
- ✅ Prevents resource exhaustion
- ✅ 408 Request Timeout status code

## Installation

Copy this middleware into your project:

```bash
# Using the burger-api CLI (coming soon)
burger-api add timeout

# Or manually copy the timeout.ts file to your middleware folder
```

## Usage

### Basic Usage (30 second timeout)

```typescript
import { Burger } from 'burger-api';
import { requestTimeout } from './middleware/timeout/timeout';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        requestTimeout() // 30 second timeout by default
    ]
});

app.serve(3000);
```

### Custom Timeout Duration

```typescript
import { requestTimeout } from './middleware/timeout/timeout';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        requestTimeout({ ms: 5000 }) // 5 second timeout
    ]
});
```

### Custom Error Response

```typescript
import { requestTimeout } from './middleware/timeout/timeout';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        requestTimeout({
            ms: 10000,
            message: 'The server took too long to respond',
            onTimeout: () => Response.json(
                {
                    error: 'Timeout',
                    message: 'Your request took too long to process',
                    suggestion: 'Try again later or contact support'
                },
                { status: 408 }
            )
        })
    ]
});
```

### Route-Specific Timeouts

```typescript
// api/reports/generate/route.ts
import { requestTimeout } from '../../../middleware/timeout/timeout';
import type { RouteDefinition } from 'burger-api';

// Longer timeout for report generation
const reportTimeout = requestTimeout({ ms: 120000 }); // 2 minutes

export default {
    path: '/reports/generate',
    middleware: [reportTimeout],
    handlers: {
        POST: async (req) => {
            // Long-running report generation
            const report = await generateReport();
            return Response.json({ report });
        }
    }
} satisfies RouteDefinition;
```

## Configuration Options

### `ms`

- **Type**: `number`
- **Default**: `30000` (30 seconds)

Timeout duration in milliseconds.

**Recommended values:**
- API endpoints: 5000-30000ms (5-30 seconds)
- File uploads: 60000-300000ms (1-5 minutes)
- Report generation: 120000-600000ms (2-10 minutes)

### `onTimeout`

- **Type**: `() => Response`
- **Default**: Returns 408 with JSON error

Custom error handler for timeout. Called when request exceeds time limit.

### `message`

- **Type**: `string`
- **Default**: `'Request timeout'`

Custom error message for timeout response.

## Advanced Examples

### Different Timeouts for Different Routes

```typescript
import { Burger } from 'burger-api';
import { requestTimeout } from './middleware/timeout/timeout';

// Short timeout for quick endpoints
const quickTimeout = requestTimeout({ ms: 5000 });

// Normal timeout for regular endpoints
const normalTimeout = requestTimeout({ ms: 30000 });

// Long timeout for heavy operations
const longTimeout = requestTimeout({ ms: 120000 });

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [normalTimeout] // Default
});
```

Then override in specific routes:

```typescript
// api/search/route.ts - Quick operation
export default {
    path: '/search',
    middleware: [quickTimeout],
    handlers: { /* ... */ }
};

// api/analytics/report/route.ts - Slow operation
export default {
    path: '/analytics/report',
    middleware: [longTimeout],
    handlers: { /* ... */ }
};
```

### Progressive Timeout Warnings

```typescript
import { requestTimeout } from './middleware/timeout/timeout';

// You can implement this in your handlers
handlers: {
    POST: async (req) => {
        const startTime = Date.now();
        
        // Set up warning timer
        const warningTimer = setTimeout(() => {
            console.warn(`Request taking longer than expected: ${req.url}`);
        }, 5000); // Warn after 5 seconds
        
        try {
            const result = await processRequest();
            clearTimeout(warningTimer);
            
            const duration = Date.now() - startTime;
            console.log(`Request completed in ${duration}ms`);
            
            return Response.json({ result });
        } catch (error) {
            clearTimeout(warningTimer);
            throw error;
        }
    }
}
```

### Environment-Specific Timeouts

```typescript
import { requestTimeout } from './middleware/timeout/timeout';

const timeout = requestTimeout({
    ms: process.env.NODE_ENV === 'development'
        ? 300000  // 5 minutes in dev (for debugging)
        : 30000   // 30 seconds in production
});
```

### With Retry Logic

```typescript
// Client-side retry logic for timeouts
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(30000) // Client-side timeout
            });
            
            if (response.status === 408) {
                // Server timeout - retry
                console.log(`Timeout, retrying... (${i + 1}/${maxRetries})`);
                continue;
            }
            
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
        }
    }
}
```

## How It Works

1. **Timeout Set**: When a request arrives, a timeout timer is started.

2. **Request Processing**: The request continues through middleware and handlers normally.

3. **Completion Check**:
   - If response completes before timeout: Timer is cleared, normal response sent
   - If timeout expires first: Aborts request and returns 408 error

4. **Cleanup**: Timer is always cleared to prevent memory leaks.

## Response Headers

Timeout responses include standard HTTP headers:

```http
HTTP/1.1 408 Request Timeout
Content-Type: application/json

{
    "error": "Request Timeout",
    "message": "Request timeout"
}
```

## Best Practices

### 1. Set Appropriate Timeouts

Different operations need different timeouts:

```typescript
// Quick database queries
const dbQueryTimeout = requestTimeout({ ms: 5000 });

// API calls to external services
const externalAPITimeout = requestTimeout({ ms: 15000 });

// File processing
const fileProcessingTimeout = requestTimeout({ ms: 60000 });

// Report generation
const reportTimeout = requestTimeout({ ms: 300000 });
```

### 2. Add Timeout Headers

Let clients know about timeouts:

```typescript
const timeout = requestTimeout({
    ms: 30000,
    onTimeout: () => new Response(
        JSON.stringify({ error: 'Request timeout' }),
        {
            status: 408,
            headers: {
                'Content-Type': 'application/json',
                'X-Timeout-Duration': '30000',
                'Retry-After': '60'
            }
        }
    )
});
```

### 3. Log Timeouts

Monitor which endpoints are timing out:

```typescript
const timeout = requestTimeout({
    ms: 30000,
    onTimeout: () => {
        console.error(`Request timeout: ${req.url}`, {
            method: req.method,
            url: req.url,
            timestamp: new Date().toISOString()
        });
        
        return Response.json(
            { error: 'Request timeout' },
            { status: 408 }
        );
    }
});
```

### 4. Optimize Slow Endpoints

If endpoints frequently timeout:
- Add database indexes
- Implement caching
- Use background jobs
- Add pagination
- Optimize queries

## Common Patterns

### API Gateway Pattern

```typescript
// Short timeout for gateway
const gatewayTimeout = requestTimeout({ ms: 5000 });

// Forward to backend services with their own timeouts
handlers: {
    GET: async (req) => {
        try {
            // Backend service might have longer timeout
            const response = await fetch('http://backend-service/api/data', {
                signal: AbortSignal.timeout(10000)
            });
            return response;
        } catch (error) {
            if (error.name === 'TimeoutError') {
                return Response.json({ error: 'Backend timeout' }, { status: 504 });
            }
            throw error;
        }
    }
}
```

### Graceful Degradation

```typescript
handlers: {
    GET: async (req) => {
        // Try to get fresh data with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        try {
            const freshData = await fetchFreshData({ signal: controller.signal });
            clearTimeout(timeoutId);
            return Response.json({ data: freshData, cached: false });
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Fall back to cached data
            const cachedData = await getCachedData();
            if (cachedData) {
                return Response.json({ data: cachedData, cached: true });
            }
            
            throw error;
        }
    }
}
```

### Long-Running Tasks

For operations that truly need more time, use background jobs:

```typescript
handlers: {
    POST: async (req) => {
        // Instead of processing synchronously...
        // Create a background job
        const job = await jobQueue.add('process-data', { data: req.body });
        
        // Return immediately with job ID
        return Response.json({
            jobId: job.id,
            status: 'processing',
            statusUrl: `/api/jobs/${job.id}`
        }, { status: 202 }); // 202 Accepted
    }
}
```

## Testing

### Simulate Timeout

```typescript
// In your handler
handlers: {
    GET: async (req) => {
        // Simulate slow operation
        if (process.env.NODE_ENV === 'test') {
            await new Promise(resolve => setTimeout(resolve, 35000)); // Longer than timeout
        }
        
        return Response.json({ data: 'result' });
    }
}
```

### Test with curl

```bash
# This will timeout if operation takes > 30s
curl http://localhost:3000/api/slow-endpoint -v

# Expected response
# HTTP/1.1 408 Request Timeout
# {"error":"Request Timeout","message":"Request timeout"}
```

## Limitations

- **Browser Limits**: Browsers have their own timeout limits (typically 5-10 minutes)
- **Proxy Timeouts**: Reverse proxies (nginx, Apache) may have lower timeouts
- **Not for Long Operations**: Use background jobs for operations > 1 minute

## Troubleshooting

### Timeouts Too Aggressive

Increase timeout duration:

```typescript
requestTimeout({ ms: 60000 }) // 1 minute
```

### Still Getting Timeouts

1. Check database query performance
2. Add caching layers
3. Optimize algorithms
4. Use background processing
5. Implement pagination

### Timeout Not Working

Ensure the middleware runs before your handlers:

```typescript
globalMiddleware: [
    requestTimeout({ ms: 30000 }),
    // ... other middleware
]
```

## References

- [MDN: 408 Request Timeout](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/408)
- [HTTP Status Codes](https://httpstatuses.com/408)

