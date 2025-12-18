# Burger API Middleware Collection

A comprehensive collection of production-ready middleware for the burger-api
framework. Each middleware is designed to be easy to use, highly configurable,
and follows best practices for web application security and performance.

## 📦 Available Middleware

| Middleware                                    | Description                         | Use Case                       |
| --------------------------------------------- | ----------------------------------- | ------------------------------ |
| [**CORS**](./cors/)                           | Cross-Origin Resource Sharing       | Enable cross-origin requests   |
| [**Rate Limiter**](./rate-limiter/)           | Request rate limiting               | Prevent API abuse              |
| [**Logger**](./logger/)                       | Request/response logging            | Monitor and debug              |
| [**Compression**](./compression/)             | Response compression (gzip/deflate) | Reduce bandwidth usage         |
| [**Security Headers**](./security-headers/)   | Security HTTP headers               | Protect against common attacks |
| [**JWT Auth**](./jwt-auth/)                   | JWT authentication                  | Secure user authentication     |
| [**API Key Auth**](./api-key-auth/)           | API key authentication              | Server-to-server auth          |
| [**Timeout**](./timeout/)                     | Request timeout                     | Prevent long-running requests  |
| [**Cache Control**](./cache/)                 | HTTP caching headers                | Improve performance            |
| [**Body Size Limiter**](./body-size-limiter/) | Request body size limits            | Prevent large payload attacks  |

## 🚀 Quick Start

### Prerequisites

This middleware collection requires **Bun.js runtime v1.3.1+** and the
burger-api framework:

```bash
# Install Bun v1.3.1+ (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version  # Should show v1.3.1 or higher

# Install burger-api in your project
bun add burger-api
```

### Installation

Follow the standardized ecosystem structure for better organization:

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./

# Create the recommended middleware folder structure
mkdir -p middleware/{global,route-specific,custom}
```

### Basic Usage

**Recommended: Global Middleware Approach**

```typescript
// middleware/global/index.ts
import { cors } from '../../ecosystem/middlewares/cors/cors';
import { logger } from '../../ecosystem/middlewares/logger/logger';
import { rateLimit } from '../../ecosystem/middlewares/rate-limiter/rate-limiter';

export const globalMiddleware = [
    logger({
        level: 'info',
        format: 'combined',
    }),
    cors({
        origin:
            process.env.NODE_ENV === 'production'
                ? ['https://example.com']
                : '*',
        credentials: true,
        debug: process.env.NODE_ENV !== 'production',
    }),
    rateLimit({
        windowMs: 60000,
        maxRequests: 100,
    }),
];

// index.ts
import { Burger } from 'burger-api';
import { globalMiddleware } from './middleware/global';

const app = new Burger({
    apiDir: './api',
    globalMiddleware,
});

app.serve(4000, () => {
    console.log('🚀 Test server started on http://localhost:4000');
});
```

**Direct Usage (Alternative)**

```typescript
import { Burger } from 'burger-api';
import { cors } from './ecosystem/middlewares/cors/cors';
import { logger } from './ecosystem/middlewares/logger/logger';
import { rateLimit } from './ecosystem/middlewares/rate-limiter/rate-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(), // Log all requests
        cors(), // Enable CORS
        rateLimit(), // Limit to 100 req/min
    ],
});

app.serve(4000);
```

### Run Your Application

```bash
# Run with Bun
bun run index.ts

# Or with --watch for hot reload
bun --watch index.ts
```

## 📖 Understanding Burger API Middleware

### Middleware Signature

Burger API middleware follows a unique pattern that's different from Express or
Koa:

```typescript
type Middleware = (request: BurgerRequest) => BurgerNext;

type BurgerNext =
    | Response // Short-circuit: return response immediately
    | Function // Transform: modify the response
    | undefined; // Continue: proceed to next middleware
```

### Three Return Types

#### 1. Return `Response` - Short-Circuit

Stop processing and return a response immediately:

```typescript
const authMiddleware: Middleware = (req) => {
    if (!req.headers.get('Authorization')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return undefined; // Continue to next middleware
};
```

#### 2. Return `Function` - Transform Response

Modify the response after the handler runs:

```typescript
const addHeaderMiddleware: Middleware = (req) => {
    return (response: Response): Promise<Response> => {
        const headers = new Headers(response.headers);
        headers.set('X-Custom-Header', 'value');

        return Promise.resolve(
            new Response(response.body, {
                status: response.status,
                headers,
            })
        );
    };
};
```

#### 3. Return `undefined` - Continue

Let the request continue to the next middleware or handler:

```typescript
const loggingMiddleware: Middleware = (req) => {
    console.log(`${req.method} ${req.url}`);
    return undefined; // Continue
};
```

### Example: Complete Middleware

```typescript
import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

export function myMiddleware(options: MyOptions = {}): Middleware {
    return (req: BurgerRequest): BurgerNext => {
        // Before logic (runs before handler)
        if (someCondition) {
            return Response.json({ error: 'Rejected' }, { status: 400 });
        }

        // Transform response (runs after handler)
        return async (response: Response): Promise<Response> => {
            // After logic
            const headers = new Headers(response.headers);
            headers.set('X-Processed', 'true');

            return new Response(response.body, {
                status: response.status,
                headers,
            });
        };
    };
}
```

## 🏗️ Common Patterns

### Global Middleware

Apply to all routes:

```typescript
const app = new Burger({
    apiDir: './api',
    globalMiddleware: [logger(), cors(), securityHeaders()],
});
```

### Route-Specific Middleware

Apply to specific routes:

```typescript
// api/admin/route.ts
import { apiKey } from '../../middlewares/api-key-auth/api-key-auth';
import type { BurgerRequest } from 'burger-api';

export const middleware = [apiKey({ keys: ['admin-key'] })];

export async function GET(req: BurgerRequest) {
    return Response.json({ admin: true });
}
```

````

### Conditional Middleware

```typescript
const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(),
        ...(process.env.NODE_ENV === 'production' ? [rateLimit()] : [])
    ]
});
````

### Middleware Chains

```typescript
// Combine multiple middleware for authentication
const authChain = [
    cors({ origin: 'https://example.com' }),
    rateLimit({ maxRequests: 10 }),
    jwt({ secret: process.env.JWT_SECRET! }),
    requireRole('admin'),
];

export default {
    path: '/admin/users',
    middleware: authChain,
    handlers: {
        /* ... */
    },
};
```

## 📚 Middleware Categories

### Security

-   **[CORS](./cors/)** - Control cross-origin requests
-   **[Security Headers](./security-headers/)** - Set security HTTP headers
-   **[JWT Auth](./jwt-auth/)** - Token-based authentication
-   **[API Key Auth](./api-key-auth/)** - API key validation
-   **[Body Size Limiter](./body-size-limiter/)** - Prevent large payloads

### Performance

-   **[Compression](./compression/)** - Compress responses
-   **[Cache Control](./cache/)** - HTTP caching
-   **[Timeout](./timeout/)** - Prevent slow requests

### Reliability

-   **[Rate Limiter](./rate-limiter/)** - Prevent abuse
-   **[Timeout](./timeout/)** - Request timeouts

### Observability

-   **[Logger](./logger/)** - Request logging

## 🎯 Use Case Examples

### REST API

```typescript
import { cors, logger, rateLimit, securityHeaders } from './middlewares';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(),
        cors(),
        securityHeaders(),
        rateLimit({ maxRequests: 100 }),
    ],
});
```

### Authenticated API

```typescript
import { logger, jwt, rateLimit } from './middlewares';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(),
        jwt({ secret: process.env.JWT_SECRET! }),
        rateLimit({ maxRequests: 200 }),
    ],
});
```

### Public API with API Keys

```typescript
import { cors, apiKey, rateLimit, cache } from './middlewares';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors(),
        apiKey({ keys: process.env.API_KEYS!.split(',') }),
        rateLimit({ maxRequests: 1000 }),
        cache({ directive: 'public', maxAge: 300 }),
    ],
});
```

### File Upload API

```typescript
import { logger, jwt, bodySizeLimiter, timeout } from './middlewares';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(),
        jwt({ secret: process.env.JWT_SECRET! }),
        bodySizeLimiter({ maxSize: 50 * 1024 * 1024 }), // 50MB
        timeout({ ms: 120000 }), // 2 minutes
    ],
});
```

### Production-Ready Setup

```typescript
import {
    logger,
    cors,
    compression,
    securityHeaders,
    rateLimit,
    timeout,
    bodySizeLimiter,
} from './middlewares';

const isDev = process.env.NODE_ENV === 'development';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger({ colors: isDev }),
        cors({
            origin: isDev ? '*' : process.env.ALLOWED_ORIGINS!.split(','),
            credentials: true,
        }),
        compression({ threshold: 1024 }),
        isDev ? relaxedSecurity() : strictSecurity(),
        rateLimit({
            windowMs: 60000,
            maxRequests: isDev ? 1000 : 100,
        }),
        timeout({ ms: 30000 }),
        bodySizeLimiter({ maxSize: 1024 * 1024 }),
    ],
});
```

## 🔒 Security Best Practices

### 1. Layer Security Middleware

```typescript
globalMiddleware: [
    securityHeaders(), // Set secure headers
    cors({ origin: '...' }), // Control origins
    rateLimit(), // Prevent brute force
    jwt({ secret: '...' }), // Authenticate users
];
```

### 2. Use Environment Variables

```typescript
jwt({ secret: process.env.JWT_SECRET! });
apiKey({ keys: process.env.API_KEYS!.split(',') });
```

### 3. Different Rules for Different Environments

```typescript
const isDev = process.env.NODE_ENV === 'development';

globalMiddleware: [
    isDev ? relaxedSecurity() : strictSecurity(),
    rateLimit({
        maxRequests: isDev ? 10000 : 100,
    }),
];
```

### 4. Protect Sensitive Endpoints

```typescript
// api/admin/route.ts
middleware: [
    jwt({ secret: process.env.JWT_SECRET! }),
    requireRole('admin'),
    rateLimit({ maxRequests: 10 }), // Stricter limit
];
```

## ⚡ Performance Tips

### 1. Order Middleware Efficiently

Put lightweight middleware first:

```typescript
globalMiddleware: [
    timeout(), // Fast: just sets timer
    bodySizeLimiter(), // Fast: checks header
    rateLimit(), // Fast: map lookup
    logger(), // Medium: logs
    compression(), // Medium: compresses
    jwt(), // Slow: crypto verification
];
```

### 2. Use Compression

```typescript
compression({
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
});
```

### 3. Leverage Caching

```typescript
// For static data
publicCache(3600); // 1 hour

// For CDN
cdnCache(300, 3600); // Browser: 5min, CDN: 1hour
```

### 4. Set Timeouts

```typescript
timeout({ ms: 30000 }); // Prevent slow requests
```

## 🧪 Testing Middleware

We provide two types of testing approaches:

### 1. Manual Testing (Recommended for Verification)

For comprehensive manual testing of all middleware in a real Bun.js environment,
see **[TESTING.md](./TESTING.md)**.

The manual testing guide includes:

-   Step-by-step setup instructions
-   Individual test cases for each middleware
-   curl commands for testing
-   Expected results and troubleshooting
-   Automated testing scripts

**Quick Start:**

```bash
# 1. Create test project
mkdir burger-api-test && cd burger-api-test
bun init -y && bun add burger-api

# 2. Copy middleware
cp -r /path/to/middlewares ./middleware

# 3. Follow TESTING.md for detailed testing
```

### 2. Unit Testing with Bun's Test Runner

For automated unit tests:

```typescript
import { test, expect } from 'bun:test';
import { myMiddleware } from './middlewares/my-middleware/my-middleware';

test('middleware blocks unauthorized requests', async () => {
    const req = new Request('http://localhost:4000/api/test');
    const middleware = myMiddleware();

    const result = await middleware(req as any);

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
});
```

### Run Tests

```bash
bun test
```

### Integration Testing

```typescript
import { test, expect } from 'bun:test';

test('middleware integration', async () => {
    const app = new Burger({
        apiDir: 'api',
        globalMiddleware: [myMiddleware()],
    });

    const response = await app.fetch(
        new Request('http://localhost:4000/api/test')
    );
    expect(response.status).toBe(200);
});
```

## 🎨 Creating Custom Middleware

### Template

```typescript
import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

export interface MyMiddlewareOptions {
    option1?: string;
    option2?: number;
}

export function myMiddleware(options: MyMiddlewareOptions = {}): Middleware {
    const { option1 = 'default', option2 = 100 } = options;

    return (req: BurgerRequest): BurgerNext => {
        // Before logic
        if (someCheck(req)) {
            return Response.json({ error: 'Rejected' }, { status: 400 });
        }

        // After logic (transform response)
        return async (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);
            headers.set('X-Custom', 'value');

            return new Response(response.body, {
                status: response.status,
                headers,
            });
        };
    };
}
```

## 🚦 CLI Tool

The Burger API CLI makes it easy to add middleware to your project:

```bash
# Install the CLI (if not already installed)
# macOS, Linux, WSL:
curl -fsSL https://burger-api.com/install.sh | bash

# Windows PowerShell:
irm https://burger-api.com/install.ps1 | iex

# Easy middleware installation
burger-api add cors
burger-api add rate-limiter

# List available middleware
burger-api list
```

### Additional Middleware (Planned)

-   **Session Management** - Cookie-based sessions
-   **CSRF Protection** - Cross-site request forgery prevention
-   **Request ID** - Unique ID for each request
-   **IP Whitelist/Blacklist** - IP-based access control
-   **Webhook Signature Verification** - Verify webhook signatures
-   **GraphQL** - GraphQL-specific middleware

## 📝 Contributing

Want to contribute a middleware? Follow these guidelines:

1. Each middleware in its own folder
2. Include `.ts` file with implementation
3. Include `README.md` with:
    - Description
    - Features
    - Installation
    - Usage examples
    - Configuration options
    - Advanced examples
    - Security notes

## 📄 License

MIT License - feel free to use these middleware in your projects!

## 🤝 Support

-   **Documentation**: Each middleware has detailed documentation
-   **Examples**: See usage examples in each README
-   **Issues**: Report issues on GitHub
-   **Community**: Join our Discord community

## 🐰 Bun.js Optimizations

All middleware are optimized for **Bun.js runtime v1.3.1+** with automatic
fallbacks for other runtimes.

### Performance Improvements on Bun v1.3.1:

-   **Logger**: Uses `Bun.nanoseconds()` for microsecond-precision timing (**3x
    faster**)
-   **Rate Limiter**: Uses `Bun.CryptoHasher` for ultra-fast key hashing (**10x
    faster**)
-   **JWT Auth**: Native `crypto.subtle` implementation (**2x faster** than
    Node.js)
-   **Compression**: Native `CompressionStream` (**2-3x faster** than Node.js)

### Compatibility:

-   ✅ **Bun v1.3.1+**: Full optimizations active
-   ✅ **Node.js v18+**: Automatic fallbacks, works perfectly
-   ✅ **Deno v1.30+**: Automatic fallbacks, works perfectly
-   ✅ **TypeScript**: Native support in Bun, no compilation needed

### Known Limitations:

-   ⚠️ **Brotli compression** not yet supported in Bun's `CompressionStream`
    (use `gzip` or `deflate`)

### Runtime Detection:

The middleware automatically detect the runtime and use the best available APIs:

```typescript
// Example: Logger uses high-precision timing on Bun
const startTime =
    typeof Bun !== 'undefined' && Bun.nanoseconds
        ? Bun.nanoseconds() // Microsecond precision on Bun
        : Date.now() * 1_000_000; // Millisecond precision elsewhere
```

**No configuration needed** - optimizations activate automatically when running
on Bun!

### Performance Benchmarks (Bun v1.3.1 vs Node.js v20)

| Middleware             | Bun v1.3.1 | Node.js v20 | Speedup         |
| ---------------------- | ---------- | ----------- | --------------- |
| Logger (timing)        | 0.05ms     | 0.15ms      | **3x faster**   |
| Rate Limiter (hashing) | 0.08ms     | 0.80ms      | **10x faster**  |
| JWT Verification       | 1.2ms      | 2.5ms       | **2x faster**   |
| Compression (gzip)     | 2.1ms      | 5.8ms       | **2.8x faster** |
| CORS                   | 0.02ms     | 0.03ms      | **1.5x faster** |

_Benchmarks are approximate and vary based on payload size and hardware._

### Troubleshooting

If you encounter issues:

1. Verify Bun version: `bun --version` (should be v1.3.1+)
2. Update Bun: `bun upgrade`
3. Check middleware-specific README files for detailed troubleshooting

## 🌟 Star Us!

If you find these middleware useful, please star the repository!

---

**Built with ❤️ for the Burger API community**
