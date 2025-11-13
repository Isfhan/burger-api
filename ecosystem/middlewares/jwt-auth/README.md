# JWT Authentication Middleware

JWT (JSON Web Token) authentication middleware for burger-api framework. This middleware verifies JWT tokens from requests and protects your routes from unauthorized access.

## Features

- ✅ Bearer token authentication
- ✅ Cookie-based authentication
- ✅ Query parameter authentication
- ✅ Custom token extraction
- ✅ Signature verification
- ✅ Expiration checking
- ✅ Not-before time validation
- ✅ Attaches decoded user data to request
- ✅ Custom error handling
- ✅ Multiple HMAC algorithms (HS256, HS384, HS512)

## Installation

Copy this middleware into your project following the standardized ecosystem structure:

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./

# Create the recommended middleware folder structure
mkdir -p middleware/{global,route-specific,custom}
```

## Usage

### Basic Usage (Authorization Header)

```typescript
import { Burger } from 'burger-api';
import { jwt } from './ecosystem/middlewares/jwt-auth/jwt-auth';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        jwt({ secret: 'your-secret-key' })
    ]
});

app.serve(4000);
```

**Client Request:**
```http
GET /api/protected HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Cookie-Based Authentication

```typescript
import { jwt } from './ecosystem/middlewares/jwt-auth/jwt-auth';

const jwtAuth = jwt({
    secret: 'your-secret-key',
    cookie: 'token' // Look for JWT in 'token' cookie
});
```

**Client Request:**
```http
GET /api/protected HTTP/1.1
Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Query Parameter Authentication

```typescript
import { jwt } from './ecosystem/middlewares/jwt-auth/jwt-auth';

const jwtAuth = jwt({
    secret: 'your-secret-key',
    queryParam: 'token' // Look for JWT in ?token= query param
});
```

**Client Request:**
```http
GET /api/protected?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Custom Token Extraction

```typescript
import { jwt } from './ecosystem/middlewares/jwt-auth/jwt-auth';

const jwtAuth = jwt({
    secret: 'your-secret-key',
    getToken: (req) => {
        // Check custom header first
        const customToken = req.headers.get('X-Auth-Token');
        if (customToken) return customToken;
        
        // Fall back to Authorization header
        const auth = req.headers.get('Authorization');
        return auth?.startsWith('Bearer ') ? auth.substring(7) : null;
    }
});
```

### Custom Error Handling

```typescript
import { jwt } from './ecosystem/middlewares/jwt-auth/jwt-auth';

const jwtAuth = jwt({
    secret: 'your-secret-key',
    onError: (reason) => {
        return Response.json(
            { 
                success: false,
                error: 'Authentication failed',
                reason,
                timestamp: new Date().toISOString()
            },
            { status: 401 }
        );
    }
});
```

### Route-Specific Protection

```typescript
// api/users/profile/route.ts
import { jwt } from '../../../middleware/jwt-auth/jwt-auth';
import type { BurgerRequest } from 'burger-api';

const jwtAuth = jwt({ secret: process.env.JWT_SECRET! });

export const middleware = [jwtAuth]; // Only protect this route

export async function GET(req: BurgerRequest) {
    // Access decoded user data
    const user = (req as any).user;
    return Response.json({ user });
}
```
```

### Accessing User Data in Handlers

```typescript
// After JWT middleware runs, user data is attached to request
handlers: {
    GET: async (req) => {
        const user = (req as any).user;
        
        console.log('User ID:', user.sub);
        console.log('User Email:', user.email);
        console.log('User Roles:', user.roles);
        
        return Response.json({ message: `Hello, ${user.name}!` });
    }
}
```

## Configuration Options

### `secret` (required)

- **Type**: `string`

Secret key for verifying JWT signatures. Keep this secure!

**Security Notes:**
- Use environment variables: `process.env.JWT_SECRET`
- Never commit secrets to version control
- Use strong, random secrets (at least 32 characters)
- Rotate secrets periodically

### `algorithm`

- **Type**: `'HS256' | 'HS384' | 'HS512'`
- **Default**: `'HS256'`

HMAC algorithm for JWT verification.

- `HS256`: HMAC with SHA-256 (most common)
- `HS384`: HMAC with SHA-384 (more secure)
- `HS512`: HMAC with SHA-512 (most secure)

### `cookie`

- **Type**: `string`
- **Default**: `undefined`

Cookie name containing the JWT token. If specified, the middleware will check cookies.

### `queryParam`

- **Type**: `string`
- **Default**: `undefined`

Query parameter name containing the JWT token. If specified, checks URL parameters.

**⚠️ Warning:** Query parameters are logged and visible in URLs. Use with caution.

### `getToken`

- **Type**: `(req: BurgerRequest) => string | null`
- **Default**: `undefined`

Custom function to extract the token from the request. Overrides default extraction logic.

### `onError`

- **Type**: `(reason: string) => Response`
- **Default**: Returns 401 with JSON error

Custom error handler for authentication failures.

### `requestProperty`

- **Type**: `string`
- **Default**: `'user'`

Property name to attach decoded user data to the request object.

## JWT Token Structure

### Standard JWT Payload

```typescript
{
  "sub": "user-id",           // Subject (user ID)
  "name": "John Doe",         // User name
  "email": "john@example.com", // User email
  "roles": ["user", "admin"], // User roles
  "iat": 1634567890,          // Issued at (seconds since epoch)
  "exp": 1634654290           // Expires at (seconds since epoch)
}
```

### Creating JWTs

```typescript
import { createJWT } from './ecosystem/middlewares/jwt-auth/jwt-auth';

// Create a JWT token
const token = await createJWT(
    {
        sub: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        roles: ['user'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // Expires in 1 hour
    },
    'your-secret-key',
    'HS256'
);

console.log(token); // eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Advanced Examples

### Different Auth for Different Routes

```typescript
// Public routes (no auth)
const publicRouter = createRouter('/public');

// User routes (basic auth)
const userAuth = jwt({ secret: process.env.JWT_SECRET! });
const userRouter = createRouter('/users', [userAuth]);

// Admin routes (stricter auth with role checking)
const adminAuth = jwt({
    secret: process.env.JWT_SECRET!,
    onError: (reason) => Response.json({ error: reason }, { status: 403 })
});
const adminRouter = createRouter('/admin', [adminAuth]);
```

### Role-Based Authorization

```typescript
// Create a custom middleware that checks roles after JWT auth
function requireRole(role: string): Middleware {
    return (req: BurgerRequest): BurgerNext => {
        const user = (req as any).user;
        
        if (!user || !user.roles || !user.roles.includes(role)) {
            return Response.json(
                { error: 'Insufficient permissions' },
                { status: 403 }
            );
        }
        
        return undefined; // Continue
    };
}

// Use it in routes
export const middleware = [
    jwt({ secret: process.env.JWT_SECRET! }),
    requireRole('admin')
];

export async function GET(req: BurgerRequest) {
    // Only admins can access this
    return Response.json({ users: [] });
}
```

### Environment-Specific Configuration

```typescript
const jwtAuth = jwt({
    secret: process.env.JWT_SECRET || 'dev-secret',
    algorithm: process.env.NODE_ENV === 'production' ? 'HS512' : 'HS256',
    cookie: process.env.NODE_ENV === 'production' ? 'secure_token' : 'token'
});
```

### Multiple Authentication Methods

```typescript
const jwtAuth = jwt({
    secret: process.env.JWT_SECRET!,
    getToken: (req) => {
        // Try Authorization header first
        const authHeader = req.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        
        // Try cookie
        const cookies = parseCookies(req.headers.get('Cookie') || '');
        if (cookies.token) {
            return cookies.token;
        }
        
        // Try query param (for webhooks, etc.)
        const url = new URL(req.url);
        if (url.searchParams.has('token')) {
            return url.searchParams.get('token');
        }
        
        return null;
    }
});
```

### Token Refresh Flow

```typescript
// Login route - issue tokens
handlers: {
    POST: async (req) => {
        const { username, password } = await req.json();
        
        // Validate credentials...
        
        // Create access token (short-lived)
        const accessToken = await createJWT(
            { sub: user.id, type: 'access' },
            process.env.JWT_SECRET!,
            'HS256'
        );
        
        // Create refresh token (long-lived)
        const refreshToken = await createJWT(
            { sub: user.id, type: 'refresh' },
            process.env.JWT_REFRESH_SECRET!,
            'HS256'
        );
        
        return Response.json({
            accessToken,
            refreshToken,
            expiresIn: 3600
        });
    }
}
```

## Security Best Practices

### 1. Use Strong Secrets

```typescript
// ❌ Bad
secret: 'password123'

// ✅ Good
secret: process.env.JWT_SECRET // Long, random string
```

### 2. Set Expiration Times

```typescript
const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
};
```

### 3. Use HTTPS

JWT tokens should only be transmitted over HTTPS to prevent interception.

### 4. Store Tokens Securely

- **Cookies**: Use `HttpOnly`, `Secure`, and `SameSite` flags
- **Local Storage**: Risk of XSS attacks
- **Session Storage**: Better than local storage, but still vulnerable

### 5. Implement Token Refresh

Use short-lived access tokens and long-lived refresh tokens.

### 6. Validate All Claims

```typescript
const user = (req as any).user;

// Check expiration
if (user.exp && user.exp < Date.now() / 1000) {
    return Response.json({ error: 'Token expired' }, { status: 401 });
}

// Check issuer
if (user.iss !== 'your-app') {
    return Response.json({ error: 'Invalid issuer' }, { status: 401 });
}
```

## Common Issues

### "Invalid signature"

- Verify the secret matches what was used to create the token
- Check the algorithm matches (`HS256`, `HS384`, etc.)

### "Token expired"

Token's `exp` claim is in the past. Issue a new token or implement token refresh.

### "No token provided"

Client didn't send the token. Ensure:
- Authorization header is set: `Authorization: Bearer <token>`
- Or cookie/query param is included if configured

### User data not available

Make sure JWT middleware runs before your handler and check the correct property name:

```typescript
const user = (req as any).user; // Default
// or
const user = (req as any).yourCustomProperty; // If using requestProperty option
```

## Testing

### With curl

```bash
# Get a token first
TOKEN=$(curl -X POST http://localhost:4000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}' \
  | jq -r '.token')

# Use the token
curl http://localhost:4000/api/protected \
  -H "Authorization: Bearer $TOKEN"
```

### In Tests

```typescript
import { createJWT } from './ecosystem/middlewares/jwt-auth/jwt-auth';

const token = await createJWT(
    { sub: 'test-user-id', email: 'test@example.com' },
    'test-secret',
    'HS256'
);

const response = await fetch('http://localhost:4000/api/protected', {
    headers: { 'Authorization': `Bearer ${token}` }
});
```

## Production Recommendations

1. **Use Environment Variables**: Never hardcode secrets
2. **Use HS512**: More secure than HS256
3. **Set Short Expiration**: 15 minutes to 1 hour for access tokens
4. **Implement Refresh Tokens**: For better UX
5. **Use HTTPS Only**: Protect tokens in transit
6. **Log Auth Failures**: Monitor for suspicious activity
7. **Consider JWT Libraries**: For production, use libraries like `jose` for full JWT support

## Limitations

This is a simplified JWT implementation suitable for many use cases. For advanced features, consider using a dedicated JWT library:

- **No RS256/ES256**: Only HMAC algorithms supported
- **Limited Validation**: Basic exp/nbf checking only
- **No JWT Claims Validation**: You'll need to implement additional checks

## References

- [JWT.io](https://jwt.io/)
- [RFC 7519: JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [OWASP: JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

