# Logger Hooks

Request logging hook factory for burger-api framework. Hooks are code that runs around your handler — before and/or after it. This hook factory logs HTTP requests with method, URL, status code, response time, and optional additional information.

## Features

- ✅ Colorized console output
- ✅ Request method, URL, and path logging
- ✅ Response status code and duration
- ✅ ISO 8601 timestamps
- ✅ Request ID generation (UUID)
- ✅ Structured JSON logging format
- ✅ Optional headers logging
- ✅ Optional query parameters logging
- ✅ Optional request body logging
- ✅ Custom log formatters
- ✅ Custom log functions (file, external service, etc.)
- ✅ Skip specific paths (health checks, metrics, etc.)

## Installation

Copy this hook factory into your project following the standardized ecosystem structure:

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./

# Or install via the CLI
burger-api add logger
```

## Usage

### Basic Usage

```typescript
// src/hooks.ts
import { logger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [logger()];

// index.ts
import { Burger } from 'burger-api';
new Burger({ apiDir: './src/api' }).serve(4000);
```

**Output:**
```
[2024-10-22T10:30:45.123Z] GET /api/users 200 45ms
[2024-10-22T10:30:46.456Z] POST /api/users 201 123ms
[2024-10-22T10:30:47.789Z] GET /api/users/123 200 12ms
```

### With Request IDs

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    requestId: true,
    requestIdHeader: 'X-Request-ID',
})];
```

**Output:**
```
[2024-10-22T10:30:45.123Z] [550e8400-e29b-41d4-a716-446655440000] GET /api/users 200 45ms
```

The request ID is:
- Extracted from the `X-Request-ID` header if present
- Generated as a UUID if not provided
- Attached to `ctx.requestId` for use in handlers

### JSON Format

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    format: 'json',
})];
```

**Output:**
```json
{"timestamp":"2024-10-22T10:30:45.123Z","method":"GET","path":"/api/users","status":200,"duration":45,"requestId":"550e8400-e29b-41d4-a716-446655440000"}
```

### With Additional Options

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    colors: true,
    logQuery: true,
    logHeaders: false
})];
```

### Skip Health Check Endpoints

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    skip: '/health' // Don't log health check requests
})];
```

### Skip Multiple Paths with Regex

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    skip: /^\/(health|metrics|favicon\.ico)/ // Skip health, metrics, favicon
})];
```

### Custom Skip Function

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    skip: (ctx) => {
        // Skip OPTIONS requests and health checks
        return ctx.method === 'OPTIONS' || ctx.url.includes('/health');
    }
})];
```

### Custom Formatter

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    formatter: (info) => {
        // Custom format: "[timestamp] method path status duration"
        return `[${info.timestamp}] ${info.method} ${info.path} - ${info.status} (${info.duration}ms)`;
    }
})];
```

### JSON Logging

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    colors: false, // Disable colors for JSON
    formatter: (info) => {
        return JSON.stringify({
            timestamp: info.timestamp,
            method: info.method,
            path: info.path,
            status: info.status,
            duration: info.duration,
        });
    }
})];
```

**Output:**
```json
{"timestamp":"2024-10-22T10:30:45.123Z","method":"GET","path":"/api/users","status":200,"duration":45}
```

### Log to File

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
import fs from 'fs';

const logStream = fs.createWriteStream('app.log', { flags: 'a' });

export const beforeRoute = [createLogger({
    colors: false, // No colors for file logging
    logFn: (message) => {
        logStream.write(message + '\n');
    }
})];
```

### Detailed Logging (Development)

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
export const beforeRoute = [createLogger({
    logQuery: true,
    logHeaders: true,
    logBody: true // ⚠️ Be careful with sensitive data
})];
```

## Configuration Options

### `colors`

- **Type**: `boolean`
- **Default**: `true`

Enable colorized output for terminal. Automatically color-codes HTTP methods and status codes.

### `logHeaders`

- **Type**: `boolean`
- **Default**: `false`

Log request headers. Useful for debugging but can be verbose.

### `logQuery`

- **Type**: `boolean`
- **Default**: `false`

Log query string parameters from the URL.

### `logBody`

- **Type**: `boolean`
- **Default**: `false`

Log request body for POST/PUT/PATCH requests.

**⚠️ Warning**: 
- This may log sensitive data like passwords. Only use in development.
- This uses `request.clone()` to avoid consuming the original body stream.
- May have performance impact due to body cloning.

### `requestId`

- **Type**: `boolean`
- **Default**: `true`

Generate and include request IDs in logs. Uses UUID v4 format.

### `requestIdHeader`

- **Type**: `string`
- **Default**: `"X-Request-ID"`

Header name to check for existing request ID. If provided, uses existing ID from header; otherwise generates new one.

### `includeRequestIdInLog`

- **Type**: `boolean`
- **Default**: `true`

Include request ID in log output.

### `format`

- **Type**: `"text" | "json"`
- **Default**: `"text"`

Output format:
- `"text"`: Human-readable text format
- `"json"`: Structured JSON format

### `formatter`

- **Type**: `(info: LogInfo) => string`
- **Default**: Default formatter (timestamp, method, path, status, duration)

Custom function to format log messages. Receives log information and returns a formatted string.

**LogInfo Interface:**
```typescript
interface LogInfo {
    method: string;      // HTTP method (GET, POST, etc.)
    url: string;         // Full URL
    path: string;        // URL path only
    status: number;      // HTTP status code
    duration: number;    // Request duration in ms
    timestamp: string;   // ISO 8601 timestamp
    requestId?: string;  // Request ID (if enabled)
    headers?: Record<string, string>;  // Request headers (if enabled)
    query?: string;      // Query string (if enabled)
    body?: any;          // Request body (if enabled)
}
```

### `logFn`

- **Type**: `(message: string) => void`
- **Default**: `console.log`

Custom function to output log messages. Use this to log to files, external services, or custom loggers.

### `skip`

- **Type**: `string | RegExp | ((ctx: BurgerContext) => boolean)`
- **Default**: `undefined`

Skip logging for specific requests:
- `string`: Skip if URL includes this string
- `RegExp`: Skip if URL matches regex
- `function`: Skip if function returns true

## Color Coding

The logger automatically color-codes output for better readability:

### HTTP Methods

- 🟢 **GET**: Green
- 🔵 **POST**: Cyan
- 🟡 **PUT**: Yellow
- 🟣 **PATCH**: Magenta
- 🔴 **DELETE**: Red
- ⚪ **OPTIONS**: Gray

### Status Codes

- 🟢 **2xx**: Green (Success)
- 🔵 **3xx**: Cyan (Redirect)
- 🟡 **4xx**: Yellow (Client Error)
- 🔴 **5xx**: Bright Red (Server Error)

## Advanced Examples

### Production Logging Setup

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';
import fs from 'fs';

const isDev = process.env.NODE_ENV === 'development';
const logFile = fs.createWriteStream('production.log', { flags: 'a' });

export const beforeRoute = [createLogger({
    colors: isDev,
    logQuery: isDev,
    logHeaders: isDev,
    logFn: isDev
        ? console.log
        : (message) => logFile.write(message + '\n'),
    formatter: isDev
        ? undefined // Use default colorized format
        : (info) => JSON.stringify({
            timestamp: info.timestamp,
            method: info.method,
            path: info.path,
            status: info.status,
            duration: info.duration,
            level: info.status >= 500 ? 'error' : 'info'
        }),
    skip: /^\/(health|metrics)/
})];
```

### Integration with External Logging Services

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';

// Example: Send logs to external service
async function sendToLoggingService(logData: any) {
    await fetch('https://logging-service.com/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
    });
}

export const beforeRoute = [createLogger({
    colors: false,
    formatter: (info) => {
        // Still log to console
        console.log(`${info.method} ${info.path} - ${info.status} (${info.duration}ms)`);
        
        // Also send to external service (fire and forget)
        sendToLoggingService(info).catch(console.error);
        
        return ''; // Already logged to console
    }
})];
```

### Different Logs for Different Routes

```typescript
// src/api/admin/hooks.ts
import { createLogger } from '../../ecosystem/hooks/logger/logger';

// Detailed logging for admin routes
const adminLogger = createLogger({
    logHeaders: true,
    logQuery: true,
    formatter: (info) => {
        return `[ADMIN] ${info.method} ${info.path} - ${info.status} (${info.duration}ms)`;
    }
});

export const beforeRoute = [adminLogger];
```

## Performance Notes

- ✅ Minimal overhead: Only captures timestamp before and after request
- ✅ Response transformation used to calculate duration accurately
- ✅ No blocking operations during request processing
- ⚠️ Enabling `logBody` requires parsing request body, which has performance impact
- 🐰 **Bun.js Optimization**: Uses `Bun.nanoseconds()` for microsecond-precision timing

## Security Notes

- ⚠️ `logHeaders` may expose sensitive information (Authorization tokens, cookies)
- ⚠️ `logBody` may log passwords, API keys, or other sensitive data
- ✅ Use `skip` to avoid logging sensitive endpoints
- ✅ Sanitize logs before sending to external services
- ✅ In production, log to files with proper rotation and security

## Common Patterns

### Development vs Production

```typescript
const isDev = process.env.NODE_ENV === 'development';

createLogger({
    colors: isDev,
    logQuery: isDev,
    logHeaders: isDev
})
```

### Skip Static Assets

```typescript
createLogger({
    skip: /\.(js|css|png|jpg|svg|ico)$/
})
```

### Only Log Errors

```typescript
createLogger({
    skip: (ctx) => {
        // Log everything, filter in formatter
        return false;
    },
    formatter: (info) => {
        if (info.status >= 400) {
            return `[ERROR] ${info.method} ${info.path} - ${info.status}`;
        }
        return ''; // Skip logging for successful requests
    }
})
```

## 🐰 Bun.js Optimization

This hook leverages **Bun-specific APIs** for enhanced performance when running on Bun.js v1.3.1+:

### High-Precision Timing with `Bun.nanoseconds()`

Instead of `Date.now()` (millisecond precision), the hook uses `Bun.nanoseconds()` when available:

```typescript
// Standard timing (1ms precision):
Date.now() → 1234567890123

// Bun high-precision timing (nanosecond precision):
Bun.nanoseconds() → 1234567890123456789
```

**Benefits:**
- ⚡ **Microsecond accuracy**: Measure even sub-millisecond requests
- 📊 **Better metrics**: More accurate performance data
- 🔄 **Automatic fallback**: Works on other runtimes without changes

**Example output showing sub-millisecond precision:**
```
[2024-10-22T10:30:45.123Z] GET /api/fast 200 0.45ms
[2024-10-22T10:30:46.456Z] GET /api/cached 200 0.12ms
[2024-10-22T10:30:47.789Z] POST /api/users 201 123.67ms
```

The implementation automatically detects Bun and falls back to `Date.now()` on other runtimes, ensuring compatibility everywhere.

## References

- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [ANSI Color Codes](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Bun.nanoseconds() Documentation](https://bun.sh/docs/api/utils#bun-nanoseconds)

