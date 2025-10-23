# CORS Middleware

Cross-Origin Resource Sharing (CORS) middleware for burger-api framework. This middleware enables your API to be accessible from different origins by setting appropriate CORS headers.

## Features

- ✅ Allow all origins or specific origins
- ✅ Support multiple allowed origins
- ✅ Custom origin validation with functions
- ✅ Automatic preflight (OPTIONS) request handling
- ✅ Configurable HTTP methods and headers
- ✅ Credentials support
- ✅ Max-age caching for preflight requests

## Installation

Copy this middleware into your project:

```bash
# Using the burger-api CLI (coming soon)
burger-api add cors

# Or manually copy the cors.ts file to your middleware folder
```

## Usage

### Basic Usage (Allow All Origins)

```typescript
import { Burger } from 'burger-api';
import { cors } from './middleware/cors/cors';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors() // Allows all origins with default settings
    ]
});

app.serve(3000);
```

### Allow Specific Origin

```typescript
import { cors } from './middleware/cors/cors';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors({
            origin: 'https://example.com',
            credentials: true
        })
    ]
});
```

### Allow Multiple Origins

```typescript
import { cors } from './middleware/cors/cors';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors({
            origin: [
                'https://example.com',
                'https://app.example.com',
                'https://admin.example.com'
            ],
            credentials: true
        })
    ]
});
```

### Custom Origin Validation

```typescript
import { cors } from './middleware/cors/cors';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors({
            // Allow all subdomains of example.com
            origin: (origin) => origin.endsWith('.example.com'),
            credentials: true
        })
    ]
});
```

### Route-Specific CORS

```typescript
// api/products/route.ts
import { cors } from '../../middleware/cors/cors';
import type { BurgerRequest } from 'burger-api';

export const middleware = [
    cors({
        origin: 'https://shop.example.com',
        methods: ['GET', 'POST']
    })
];

export async function GET(req: BurgerRequest) {
    return Response.json({ products: [] });
}
```

## Configuration Options

### `origin`

- **Type**: `string | string[] | ((origin: string) => boolean)`
- **Default**: `'*'`

Configures which origins are allowed to access your API.

- `'*'`: Allow all origins
- `'https://example.com'`: Allow a specific origin
- `['https://example.com', 'https://app.example.com']`: Allow multiple origins
- `(origin) => boolean`: Custom validation function

### `methods`

- **Type**: `string[]`
- **Default**: `['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']`

Specifies which HTTP methods are allowed when accessing the resource.

### `allowedHeaders`

- **Type**: `string[]`
- **Default**: `['Content-Type', 'Authorization']`

Specifies which headers can be used during the actual request.

### `exposedHeaders`

- **Type**: `string[]`
- **Default**: `[]`

Specifies which response headers are safe to expose to the client.

### `credentials`

- **Type**: `boolean`
- **Default**: `false`

Indicates whether the response can be shared when credentials (cookies, HTTP authentication) are included.

**Important**: When `credentials` is `true`, `origin` cannot be `'*'`. You must specify exact origins.

### `maxAge`

- **Type**: `number`
- **Default**: `600` (10 minutes)

Indicates how long (in seconds) the results of a preflight request can be cached.

## Advanced Examples

### Production Configuration

```typescript
import { cors } from './middleware/cors/cors';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors({
            origin: process.env.NODE_ENV === 'production'
                ? ['https://example.com', 'https://app.example.com']
                : '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
            exposedHeaders: ['X-Total-Count', 'X-Page-Number'],
            credentials: true,
            maxAge: 86400 // 24 hours
        })
    ]
});
```

### With Custom Headers

```typescript
const corsMiddleware = cors({
    origin: 'https://example.com',
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-API-Key',
        'X-Request-ID',
        'X-Custom-Header'
    ],
    exposedHeaders: [
        'X-Total-Count',
        'X-Page-Number',
        'X-RateLimit-Remaining'
    ]
});
```

## How It Works

1. **Preflight Requests (OPTIONS)**: The middleware automatically handles preflight requests by returning a `204 No Content` response with appropriate CORS headers.

2. **Regular Requests**: For all other requests, the middleware adds CORS headers to the response using response transformation.

3. **Origin Validation**: The middleware validates the request origin against your configuration and sets the `Access-Control-Allow-Origin` header accordingly.

## Common Use Cases

### Public API (No Authentication)

```typescript
cors({
    origin: '*',
    methods: ['GET', 'POST']
})
```

### Authenticated API

```typescript
cors({
    origin: ['https://example.com'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
})
```

### Multi-tenant Application

```typescript
cors({
    origin: (origin) => {
        // Allow all subdomains
        return origin.endsWith('.example.com') || origin === 'https://example.com';
    },
    credentials: true
})
```

## Security Notes

- ⚠️ Using `origin: '*'` makes your API accessible from any website. Only use this for public APIs.
- ⚠️ When using `credentials: true`, you cannot use `origin: '*'`. You must specify exact origins.
- ✅ For production applications, always specify exact allowed origins.
- ✅ Only include necessary headers in `allowedHeaders` and `exposedHeaders`.

## Troubleshooting

### CORS Error: "Origin not allowed"

Make sure the requesting origin is included in your `origin` configuration.

### Credentials Not Working

Ensure both `credentials: true` is set AND you're specifying exact origins (not `'*'`).

### Custom Headers Not Received

Add your custom headers to the `allowedHeaders` array (for request headers) or `exposedHeaders` array (for response headers).

## References

- [MDN: Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [W3C CORS Specification](https://www.w3.org/TR/cors/)

