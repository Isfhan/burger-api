# API Key Authentication Middleware

API key authentication middleware for burger-api framework. Middleware is code that runs around your handler — before and/or after it. This middleware protects your routes by verifying API keys from headers or query parameters.

## Features

- ✅ Header-based authentication (X-API-Key)
- ✅ Query parameter authentication
- ✅ Static key validation
- ✅ Dynamic/async key validation (database, external service)
- ✅ Custom key extraction
- ✅ Per-key rate limiting
- ✅ Custom error handling
- ✅ Attaches API key to request

## Installation

Copy this middleware into your project following the standardized ecosystem structure:

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./

# Create the recommended middleware folder structure
mkdir -p middleware/{global,route-specific,custom}
```

## Usage

### Basic Usage (Static Keys)

```typescript
import { Burger } from 'burger-api';
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        apiKey({
            keys: ['key-1', 'key-2', 'key-3']
        })
    ]
});

app.serve(4000);
```

**Client Request:**
```http
GET /api/data HTTP/1.1
X-API-Key: key-1
```

### With Database Validation

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKey({
    keys: async (key) => {
        // Query your database
        const result = await db.query(
            'SELECT * FROM api_keys WHERE key = ? AND active = true',
            [key]
        );
        return result.length > 0;
    }
});
```

### Query Parameter Authentication

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKey({
    keys: ['key-1', 'key-2'],
    queryParam: 'api_key' // Allow ?api_key=xxx
});
```

**Client Request:**
```http
GET /api/data?api_key=key-1 HTTP/1.1
```

### Custom Header Name

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKey({
    keys: ['key-1', 'key-2'],
    header: 'Authorization',
    getKey: (req) => {
        const auth = req.headers.get('Authorization');
        // Extract from "ApiKey xxx" format
        return auth?.startsWith('ApiKey ') ? auth.substring(7) : null;
    }
});
```

### With Rate Limiting Per Key

```typescript
import { apiKeyWithRateLimit } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKeyWithRateLimit(
    {
        keys: ['key-1', 'key-2', 'key-3']
    },
    {
        windowMs: 60000, // 1 minute
        maxRequests: 100 // 100 requests per minute per key
    }
);
```

### Custom Error Messages

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKey({
    keys: ['key-1', 'key-2'],
    onError: (reason) => {
        return Response.json(
            {
                success: false,
                error: 'API Authentication Failed',
                message: reason,
                documentation: 'https://docs.example.com/authentication'
            },
            { status: 401 }
        );
    }
});
```

## Configuration Options

### `keys` (required)

- **Type**: `Set<string> | string[] | ((key: string) => Promise<boolean> | boolean)`

Valid API keys or validation function.

**Static keys:**
```typescript
keys: ['key1', 'key2', 'key3']
// or
keys: new Set(['key1', 'key2', 'key3'])
```

**Dynamic validation:**
```typescript
keys: async (key) => {
    const valid = await validateAPIKey(key);
    return valid;
}
```

### `header`

- **Type**: `string`
- **Default**: `'X-API-Key'`

Header name to check for the API key.

### `queryParam`

- **Type**: `string`
- **Default**: `undefined`

Query parameter name for API key. If specified, checks URL parameters as fallback.

### `getKey`

- **Type**: `(req: BurgerRequest) => string | null`
- **Default**: `undefined`

Custom function to extract API key from request. Overrides default logic.

### `onError`

- **Type**: `(reason: string) => Response`
- **Default**: Returns 401 with JSON error

Custom error handler for auth failures.

### `requestProperty`

- **Type**: `string`
- **Default**: `'apiKey'`

Property name to attach API key to request object.

### `exposeKeyInError`

- **Type**: `boolean`
- **Default**: `false`

Whether to include the API key in error messages. Set to `false` in production.

## Advanced Examples

### Tiered API Access

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const freeKeys = new Set(['free-key-1', 'free-key-2']);
const premiumKeys = new Set(['premium-key-1', 'premium-key-2']);

// Free tier - stricter rate limits
const freeAuth = apiKey({
    keys: freeKeys,
    requestProperty: 'apiKeyFree'
});

// Premium tier - higher limits
const premiumAuth = apiKey({
    keys: premiumKeys,
    requestProperty: 'apiKeyPremium'
});
```

### Database with Metadata

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKey({
    keys: async (key) => {
        const result = await db.query(`
            SELECT k.*, u.email, u.name 
            FROM api_keys k 
            JOIN users u ON k.user_id = u.id 
            WHERE k.key = ? AND k.active = true
        `, [key]);
        
        if (result.length === 0) return false;
        
        // Store metadata on request
        (req as any).apiKeyData = {
            userId: result[0].user_id,
            userEmail: result[0].email,
            userName: result[0].name,
            keyCreated: result[0].created_at
        };
        
        // Update last_used timestamp
        await db.query('UPDATE api_keys SET last_used = NOW() WHERE key = ?', [key]);
        
        return true;
    }
});
```

### Multiple Authentication Methods

```typescript
// Allow either JWT or API key
function flexibleAuth(): Middleware[] {
    return [
        async (req: BurgerRequest): Promise<BurgerNext> => {
            // Try JWT first
            const authHeader = req.headers.get('Authorization');
            if (authHeader?.startsWith('Bearer ')) {
                // JWT middleware would run here
                return undefined; // Continue with JWT
            }
            
            // Try API key
            const apiKeyHeader = req.headers.get('X-API-Key');
            if (apiKeyHeader) {
                // Validate API key
                const valid = await validateAPIKey(apiKeyHeader);
                if (valid) {
                    (req as any).apiKey = apiKeyHeader;
                    return undefined;
                }
            }
            
            // No valid auth method
            return Response.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }
    ];
}
```

### Route-Specific API Keys

```typescript
// api/admin/route.ts
import { apiKey } from '../../middleware/api-key-auth/api-key-auth';
import type { BurgerRequest } from 'burger-api';

const adminKeyAuth = apiKey({
    keys: ['admin-key-only'],
    onError: () => Response.json({ error: 'Admin access required' }, { status: 403 })
});

export const middleware = [adminKeyAuth];

export async function GET(req: BurgerRequest) {
    return Response.json({ admin: true });
}
```
```

### Logging and Analytics

```typescript
import { apiKey } from './ecosystem/middlewares/api-key-auth/api-key-auth';

const apiKeyAuth = apiKey({
    keys: async (key) => {
        const valid = await validateKey(key);
        
        if (valid) {
            // Log successful auth
            await analytics.track('api_key_used', {
                key: key.substring(0, 8) + '***', // Partial key for security
                timestamp: new Date(),
                ip: req.headers.get('X-Forwarded-For')
            });
        } else {
            // Log failed auth attempt
            await analytics.track('api_key_failed', {
                key: key.substring(0, 8) + '***',
                timestamp: new Date()
            });
        }
        
        return valid;
    }
});
```

## Security Best Practices

### 1. Generate Strong API Keys

```typescript
// Generate a secure random API key
function generateAPIKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Example: "a3f5b8c2d9e1f4a7b6c3d8e2f5a9b4c7d1e6f3a8b5c2d7e4f1a9b6c3d8e2f5a9"
```

### 2. Store Keys Securely

- Hash API keys in database (like passwords)
- Use environment variables for keys in code
- Never log full API keys
- Rotate keys regularly

### 3. Use HTTPS

Always transmit API keys over HTTPS to prevent interception.

### 4. Implement Rate Limiting

Use `apiKeyWithRateLimit` to prevent abuse:

```typescript
apiKeyWithRateLimit(
    { keys: myKeys },
    { windowMs: 60000, maxRequests: 100 }
)
```

### 5. Monitor Usage

Track API key usage to detect:
- Suspicious patterns
- Leaked keys
- Expired keys still in use

### 6. Set Expiration

Implement key expiration in your validation:

```typescript
keys: async (key) => {
    const result = await db.query(`
        SELECT * FROM api_keys 
        WHERE key = ? 
        AND active = true 
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [key]);
    return result.length > 0;
}
```

## Common Patterns

### Webhook Authentication

```typescript
// For incoming webhooks
const webhookAuth = apiKey({
    keys: [process.env.WEBHOOK_SECRET!],
    header: 'X-Webhook-Signature',
    queryParam: 'secret' // Fallback for services that can't set headers
});
```

### Internal Services

```typescript
// For service-to-service communication
const internalAuth = apiKey({
    keys: new Set([
        process.env.SERVICE_A_KEY!,
        process.env.SERVICE_B_KEY!,
        process.env.SERVICE_C_KEY!
    ]),
    header: 'X-Internal-Key'
});
```

### Public API with Tiers

```typescript
const apiKeyAuth = apiKey({
    keys: async (key) => {
        const keyData = await db.getAPIKey(key);
        if (!keyData) return false;
        
        // Attach tier information
        (req as any).apiTier = keyData.tier; // 'free', 'pro', 'enterprise'
        (req as any).apiLimits = keyData.limits;
        
        return true;
    }
});

// Then in your handler
handlers: {
    GET: async (req) => {
        const tier = (req as any).apiTier;
        
        if (tier === 'free') {
            // Return limited data
        } else if (tier === 'pro') {
            // Return more data
        } else {
            // Full access
        }
    }
}
```

## Testing

### With curl

```bash
# Header-based
curl http://localhost:4000/api/data \
  -H "X-API-Key: your-api-key"

# Query parameter
curl "http://localhost:4000/api/data?api_key=your-api-key"

# Custom header
curl http://localhost:4000/api/data \
  -H "Authorization: ApiKey your-api-key"
```

### In Tests

```typescript
const response = await fetch('http://localhost:4000/api/protected', {
    headers: {
        'X-API-Key': 'test-api-key'
    }
});

expect(response.status).toBe(200);
```

## Error Responses

### Missing API Key

```json
{
    "error": "Unauthorized",
    "message": "No API key provided"
}
```

### Invalid API Key

```json
{
    "error": "Unauthorized",
    "message": "Invalid API key"
}
```

### Rate Limit Exceeded

```json
{
    "error": "Rate Limit Exceeded",
    "message": "You have exceeded the rate limit for this API key",
    "retryAfter": 45
}
```

## Comparison: API Key vs JWT

| Feature | API Key | JWT |
|---------|---------|-----|
| **Simplicity** | ✅ Very simple | ❌ More complex |
| **Stateless** | ❌ Requires storage/validation | ✅ Self-contained |
| **Expiration** | Manual | ✅ Built-in |
| **User Context** | Limited | ✅ Rich payload |
| **Revocation** | ✅ Instant | ❌ Requires blocklist |
| **Use Case** | Server-to-server, webhooks | User authentication |

## References

- [OWASP: API Security](https://owasp.org/www-project-api-security/)
- [Best Practices for REST API Security](https://stackoverflow.blog/2021/10/06/best-practices-for-authentication-and-authorization-for-rest-apis/)

