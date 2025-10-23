# Manual Testing Guide for Burger API Middleware

This guide will help you manually test each middleware to ensure everything works correctly in a real Bun.js environment.

## Prerequisites

- **Bun v1.3.1 or later** installed ([Install Bun](https://bun.sh/docs/installation))
- Basic understanding of HTTP requests
- A tool like `curl`, Postman, or your browser

### Verify Bun Installation

```bash
# Check Bun version
bun --version
# Should show v1.3.1 or higher

# If outdated, upgrade:
bun upgrade
```

## Setup Test Environment

### Step 1: Create a Test Project

```bash
# Create a new directory for testing
mkdir burger-api-middleware-test
cd burger-api-middleware-test

# Initialize a new Bun project
bun init -y

# Install burger-api
bun add burger-api
```

### Step 2: Copy Middleware to Test

```bash
# Create middleware directory
mkdir -p middleware

# Copy the middleware you want to test
# For example, to test CORS:
cp -r /path/to/burger-api/middlewares/cors ./middleware/

# Or copy all middleware:
cp -r /path/to/burger-api/middlewares/* ./middleware/
```

### Step 3: Create Test Server

Create `index.ts` in your test project:

```typescript
import { Burger } from 'burger-api';
import { cors } from './middleware/cors/cors';
import { logger } from './middleware/logger/logger';
import { rateLimit } from './middleware/rate-limiter/rate-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(),           // Test logger
        cors(),             // Test CORS
        rateLimit()         // Test rate limiter
    ]
});

console.log('🚀 Test server starting on http://localhost:3000');
app.serve(3000);
```

### Step 4: Create Test Routes

Create `api/test/route.ts`:

```typescript
import type { BurgerRequest } from 'burger-api';

export async function GET(req: BurgerRequest) {
    return Response.json({
        message: 'Test route working!',
        timestamp: new Date().toISOString()
    });
}

export async function POST(req: BurgerRequest) {
    const body = await req.json();
    return Response.json({
        message: 'POST received',
        received: body
    });
}
```
```

### Step 5: Run Test Server

```bash
bun run index.ts
```

You should see: `🚀 Test server starting on http://localhost:3000`

---

## Testing Each Middleware

### 1. CORS Middleware

**Setup:**
```typescript
import { cors } from './middleware/cors/cors';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        cors({
            origin: '*',
            credentials: true
        })
    ]
});
```

**Test Commands:**

```bash
# Test basic CORS headers
curl -i http://localhost:3000/api/test

# Test preflight request
curl -i -X OPTIONS http://localhost:3000/api/test \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: POST"

# Test with specific origin
curl -i http://localhost:3000/api/test \
  -H "Origin: http://example.com"
```

**Expected Results:**
- Should see `Access-Control-Allow-Origin` header
- OPTIONS request should return 204
- Should see `Access-Control-Allow-Methods` header

---

### 2. Rate Limiter Middleware

**Setup:**
```typescript
import { rateLimit } from './middleware/rate-limiter/rate-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        rateLimit({
            windowMs: 60000,
            maxRequests: 5  // Only 5 requests for easy testing
        })
    ]
});
```

**Test Commands:**

```bash
# Make 6 requests quickly (should hit rate limit on 6th)
for i in {1..6}; do
  echo "Request $i:"
  curl -i http://localhost:3000/api/test
  echo "\n---"
done
```

**Expected Results:**
- First 5 requests: Status 200
- 6th request: Status 429 (Too Many Requests)
- Should see `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers
- Should see `Retry-After` header on 429 response

---

### 3. Logger Middleware

**Setup:**
```typescript
import { createLogger } from './middleware/logger/logger';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        createLogger({
            colors: true,
            logQuery: true
        })
    ]
});
```

**Test Commands:**

```bash
# Test basic logging
curl http://localhost:3000/api/test

# Test with query parameters
curl http://localhost:3000/api/test?name=test&id=123

# Test POST request
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected Results:**
- Should see colorized logs in console
- Format: `[timestamp] METHOD /path STATUS duration`
- Should log query parameters if enabled

---

### 4. Compression Middleware

**Setup:**
```typescript
import { compress } from './middleware/compression/compression';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        compress({
            threshold: 100, // Low threshold for testing
            encodings: ['gzip', 'deflate']
        })
    ]
});
```

**Test Route (return large response):**

Create `api/large/route.ts`:

```typescript
import type { BurgerRequest } from 'burger-api';

export async function GET(req: BurgerRequest) {
    // Generate large response
    const data = Array(1000).fill('x').join('');
    return Response.json({ data });
}
```
```

**Test Commands:**

```bash
# Request with gzip
curl -i http://localhost:3000/api/large \
  -H "Accept-Encoding: gzip"

# Request without compression
curl -i http://localhost:3000/api/large

# Check compression with verbose
curl -i --compressed http://localhost:3000/api/large \
  -H "Accept-Encoding: gzip, deflate"
```

**Expected Results:**
- With `Accept-Encoding`: Should see `Content-Encoding: gzip` header
- Without: No `Content-Encoding` header
- Response should be smaller when compressed

---

### 5. Security Headers Middleware

**Setup:**
```typescript
import { securityHeaders, strictSecurity } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        strictSecurity()  // or securityHeaders() for custom config
    ]
});
```

**Test Commands:**

```bash
# Check security headers
curl -i http://localhost:3000/api/test

# Verbose to see all headers
curl -v http://localhost:3000/api/test 2>&1 | grep -i "x-\|content-security\|strict-transport"
```

**Expected Results:**
- Should see `X-Frame-Options: DENY`
- Should see `X-Content-Type-Options: nosniff`
- Should see `Content-Security-Policy` header
- Should see `Strict-Transport-Security` header

---

### 6. JWT Authentication Middleware

**Setup:**
```typescript
import { jwt, createJWT } from './middleware/jwt-auth/jwt-auth';

const SECRET = 'test-secret-key-12345';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        jwt({ secret: SECRET })
    ]
});
```

**Create a login route** (to get tokens) - `api/login/route.ts`:

```typescript
import type { BurgerRequest } from 'burger-api';
import { createJWT } from '../../middleware/jwt-auth/jwt-auth';

const SECRET = 'test-secret-key-12345';

export async function POST(req: BurgerRequest) {
    // Create a test token
    const token = await createJWT(
        {
            sub: 'user-123',
            email: 'test@example.com',
            exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        },
        SECRET,
        'HS256'
    );

    return Response.json({ token });
}
```
```

**Test Commands:**

```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:3000/api/login | jq -r '.token')

# Test without token (should fail)
curl -i http://localhost:3000/api/test

# Test with valid token (should work)
curl -i http://localhost:3000/api/test \
  -H "Authorization: Bearer $TOKEN"

# Test with invalid token (should fail)
curl -i http://localhost:3000/api/test \
  -H "Authorization: Bearer invalid-token"
```

**Expected Results:**
- Without token: 401 Unauthorized
- With valid token: 200 OK
- With invalid token: 401 Unauthorized
- Should see user data attached to request in protected routes

---

### 7. API Key Authentication Middleware

**Setup:**
```typescript
import { apiKey } from './middleware/api-key-auth/api-key-auth';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        apiKey({
            keys: ['test-key-123', 'test-key-456']
        })
    ]
});
```

**Test Commands:**

```bash
# Test without API key (should fail)
curl -i http://localhost:3000/api/test

# Test with valid API key in header
curl -i http://localhost:3000/api/test \
  -H "X-API-Key: test-key-123"

# Test with invalid API key
curl -i http://localhost:3000/api/test \
  -H "X-API-Key: invalid-key"

# Test with query parameter
curl -i "http://localhost:3000/api/test?api_key=test-key-123"
```

**Expected Results:**
- Without key: 401 Unauthorized
- With valid key: 200 OK
- With invalid key: 401 Unauthorized

---

### 8. Timeout Middleware

**Setup:**
```typescript
import { requestTimeout } from './middleware/timeout/timeout';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        requestTimeout({ ms: 2000 }) // 2 second timeout
    ]
});
```

**Create slow route** - `api/slow/route.ts`:

```typescript
import type { BurgerRequest } from 'burger-api';

export async function GET(req: BurgerRequest) {
    // Simulate slow operation
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
    return Response.json({ message: 'Done' });
}
```
```

**Test Commands:**

```bash
# Test normal route (should work)
curl -i http://localhost:3000/api/test

# Test slow route (should timeout)
curl -i http://localhost:3000/api/slow
```

**Expected Results:**
- Normal route: 200 OK
- Slow route: 408 Request Timeout

---

### 9. Cache Control Middleware

**Setup:**
```typescript
import { publicCache, noCache } from './middleware/cache/cache';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        publicCache(3600) // Cache for 1 hour
    ]
});
```

**Test Commands:**

```bash
# Check cache headers
curl -i http://localhost:3000/api/test

# Verify Cache-Control header
curl -i http://localhost:3000/api/test | grep -i cache-control
```

**Expected Results:**
- Should see `Cache-Control: public, max-age=3600`
- Response should include caching directives

---

### 10. Body Size Limiter Middleware

**Setup:**
```typescript
import { bodySizeLimiter } from './middleware/body-size-limiter/body-size-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        bodySizeLimiter({
            maxSize: 1024 // 1KB for easy testing
        })
    ]
});
```

**Test Commands:**

```bash
# Test small payload (should work)
curl -i -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test large payload (should fail)
curl -i -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d "$(printf '{"data":"%2000s"}' '')"

# Test with Content-Length header
curl -i -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -H "Content-Length: 5000" \
  -d '{"test": "small"}'
```

**Expected Results:**
- Small payload: 200 OK
- Large payload: 413 Payload Too Large
- Should see error message with size information

---

## Testing Multiple Middleware Together

**Complete Setup:**

```typescript
import { Burger } from 'burger-api';
import { cors } from './middleware/cors/cors';
import { logger } from './middleware/logger/logger';
import { rateLimit } from './middleware/rate-limiter/rate-limiter';
import { compress } from './middleware/compression/compression';
import { securityHeaders } from './middleware/security-headers/security-headers';
import { bodySizeLimiter } from './middleware/body-size-limiter/body-size-limiter';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        logger(),                              // Log all requests
        cors({ origin: '*' }),                 // Enable CORS
        securityHeaders(),                     // Add security headers
        rateLimit({ maxRequests: 100 }),      // Limit to 100 req/min
        compress({ threshold: 1024 }),         // Compress responses
        bodySizeLimiter({ maxSize: 1048576 }) // 1MB limit
    ]
});

console.log('🚀 Test server running on http://localhost:3000');
console.log('📝 Test all middleware together!');
app.serve(3000);
```

**Test All Features:**

```bash
# Test everything at once
curl -i -X POST http://localhost:3000/api/test \
  -H "Origin: http://example.com" \
  -H "Accept-Encoding: gzip" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected Results:**
- Logger should print the request
- CORS headers should be present
- Security headers should be present
- Rate limit headers should be present
- Content should be compressed (if large enough)

---

## Debugging Tips

### 1. Enable Verbose Logging

```typescript
const app = new Burger({
    apiDir: './api',
    debug: true,  // Enable debug mode
    globalMiddleware: [
        createLogger({
            colors: true,
            logHeaders: true,
            logQuery: true
        })
    ]
});
```

### 2. Test One Middleware at a Time

Start with one middleware and add more gradually:

```typescript
// Test 1: Just logger
globalMiddleware: [logger()]

// Test 2: Logger + CORS
globalMiddleware: [logger(), cors()]

// Test 3: Logger + CORS + Rate Limiter
globalMiddleware: [logger(), cors(), rateLimit()]
```

### 3. Check Console Output

Watch the terminal for:
- Log messages from logger middleware
- Warning messages (e.g., brotli not supported)
- Error messages

### 4. Use Browser DevTools

Open http://localhost:3000/api/test in your browser and check:
- Network tab for headers
- Console for any JavaScript errors
- Response payload

---

## Automated Testing Script

Create `test-all.sh`:

```bash
#!/bin/bash

echo "🧪 Testing all middleware..."
echo ""

echo "1️⃣ Testing basic request..."
curl -s http://localhost:3000/api/test > /dev/null && echo "✅ Basic request OK" || echo "❌ Failed"

echo "2️⃣ Testing CORS..."
curl -s -H "Origin: http://example.com" http://localhost:3000/api/test | grep -q "Access-Control" && echo "✅ CORS OK" || echo "❌ Failed"

echo "3️⃣ Testing rate limit..."
for i in {1..6}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/test)
  if [ $i -eq 6 ] && [ $STATUS -eq 429 ]; then
    echo "✅ Rate limit OK"
    break
  fi
done

echo "4️⃣ Testing compression..."
curl -s -H "Accept-Encoding: gzip" http://localhost:3000/api/large -o /dev/null && echo "✅ Compression OK" || echo "❌ Failed"

echo "5️⃣ Testing security headers..."
curl -s -i http://localhost:3000/api/test | grep -q "X-Frame-Options" && echo "✅ Security headers OK" || echo "❌ Failed"

echo ""
echo "🎉 Testing complete!"
```

Run with:
```bash
chmod +x test-all.sh
./test-all.sh
```

---

## Troubleshooting

### Middleware Not Working?

1. **Check import paths**: Make sure imports are correct
2. **Check middleware order**: Some middleware depend on others
3. **Check Bun version**: Run `bun --version` (need v1.0.0+)
4. **Check console errors**: Look for any error messages
5. **Test middleware in isolation**: Remove other middleware temporarily

### Common Issues

**Issue**: "Cannot find module 'burger-api'"
- **Solution**: Run `bun add burger-api` in your test project

**Issue**: Middleware not applying to routes
- **Solution**: Make sure middleware is in `globalMiddleware` array or route-specific `middleware` array

**Issue**: CORS not working
- **Solution**: Check that origin is correctly configured

**Issue**: Rate limiter always returns 429
- **Solution**: Restart server or increase `maxRequests`

**Issue**: Compression not working
- **Solution**: Ensure response is large enough (above threshold) and client sends `Accept-Encoding` header

---

## Next Steps

After testing:

1. ✅ Verify all middleware work as expected
2. ✅ Test edge cases (invalid inputs, errors, etc.)
3. ✅ Test middleware combinations
4. ✅ Document any issues found
5. ✅ Create your own custom middleware

---

## Reporting Issues

If you find any issues:

1. Note which middleware has the issue
2. Include your test setup code
3. Include the exact error message
4. Include Bun version: `bun --version`
5. Include burger-api version: Check `package.json`

Happy testing! 🎉

