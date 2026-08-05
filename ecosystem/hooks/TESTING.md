# Manual Testing Guide for Burger API Hooks

Automated smoke coverage lives in the main repo: run `bun run test:all` from the
repository root, or `bun run test:ecosystem` from `packages/burger-api`.

This guide will help you manually test each hook factory to ensure everything
works correctly in a real Bun.js environment.

## Prerequisites

- **Bun v1.3.1 or later** installed
  ([Install Bun](https://bun.sh/docs/installation))
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
mkdir burger-api-hook-test
cd burger-api-hook-test

# Initialize a new Bun project
bun init -y

# Install burger-api
bun add burger-api
```

### Step 2: Copy Hooks to Test

```bash
# Create the ecosystem directory
mkdir -p ecosystem/hooks

# Copy the hooks you want to test
# For example, to test CORS:
cp -r /path/to/burger-api/ecosystem/hooks/cors ./ecosystem/hooks/

# Or copy all hooks:
cp -r /path/to/burger-api/ecosystem/hooks/* ./ecosystem/hooks/
```

### Step 3: Create Test Server

Global hooks live in `src/hooks.ts` (sibling of `index.ts`), auto-discovered
by the dev server:

```typescript
// src/hooks.ts — global hooks, applies to every request
import { logger } from '../ecosystem/hooks/logger/logger';
import { cors } from '../ecosystem/hooks/cors/cors';
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

export const onRequest = [
    cors(), // Test CORS (pre-routing, answers OPTIONS preflight)
];

export const beforeRoute = [
    logger(), // Test logger
    rateLimit(), // Test rate limiter
];

// index.ts
import { Burger } from 'burger-api';

const burger = new Burger({ apiDir: './src/api' });
burger.serve(4000, () => {
    console.log('🚀 Test server started on http://localhost:4000');
});
```

### Step 4: Create Test Routes

Create `src/api/test/route.ts`:

```typescript
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'Test route working!',
        timestamp: new Date().toISOString(),
    });
}

export async function POST(ctx: BurgerContext) {
    const body = await ctx.json();
    return Response.json({
        message: 'POST received',
        received: body,
    });
}
```

### Step 5: Run Test Server

```bash
bun run index.ts
```

You should see: `🚀 Test server started on http://localhost:4000`

---

## Testing Each Hook Factory

### 1. CORS Hooks

**Setup:**

```typescript
// src/hooks.ts
import { cors } from '../ecosystem/hooks/cors/cors';

export const onRequest = [
    cors({
        origin: '*',
        credentials: true,
    }),
];
```

**Test Commands:**

```bash
# Test basic CORS headers
curl -i http://localhost:4000/api/test

# Test preflight request
curl -i -X OPTIONS http://localhost:4000/api/test \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: POST"

# Test with specific origin
curl -i http://localhost:4000/api/test \
  -H "Origin: http://example.com"
```

**Expected Results:**

- Should see `Access-Control-Allow-Origin` header
- OPTIONS request should return 204
- Should see `Access-Control-Allow-Methods` header

> Note: `credentials: true` cannot be combined with a `'*'` origin — use an
> explicit origin or an array of origins instead.

---

### 2. Rate Limiter Hooks

**Setup:**

```typescript
// src/hooks.ts
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';

export const beforeRoute = [
    rateLimit({
        windowMs: 60000,
        maxRequests: 5, // Only 5 requests for easy testing
    }),
];
```

**Test Commands:**

```bash
# Make 6 requests quickly (should hit rate limit on 6th)
for i in {1..6}; do
  echo "Request $i:"
  curl -i http://localhost:4000/api/test
  echo "\n---"
done
```

**Expected Results:**

- First 5 requests: Status 200
- 6th request: Status 429 (Too Many Requests)
- Should see `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers
- Should see `Retry-After` header on 429 response

---

### 3. Logger Hooks

**Setup:**

```typescript
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';

export const beforeRoute = [
    createLogger({
        colors: true,
        logQuery: true,
    }),
];
```

**Test Commands:**

```bash
# Test basic logging
curl http://localhost:4000/api/test

# Test with query parameters
curl http://localhost:4000/api/test?name=test&id=123

# Test POST request
curl -X POST http://localhost:4000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected Results:**

- Should see colorized logs in console
- Format: `[timestamp] [requestId] METHOD /path STATUS duration`
- Should log query parameters if enabled
- Each response includes an `X-Request-ID` header value in the log (set on
  the context as `ctx.requestId`, request ID generation enabled by default)

---

### 4. Compression Hooks

**Setup:**

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [
    compress({
        threshold: 100, // Low threshold for testing
        encodings: ['gzip', 'deflate'],
    }),
];
```

**Test Route (return large response):**

Create `src/api/large/route.ts`:

```typescript
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    // Generate large response
    const data = Array(1000).fill('x').join('');
    return Response.json({ data });
}
```

**Test Commands:**

```bash
# Request with gzip
curl -i http://localhost:4000/api/large \
  -H "Accept-Encoding: gzip"

# Request without compression
curl -i http://localhost:4000/api/large

# Check compression with verbose
curl -i --compressed http://localhost:4000/api/large \
  -H "Accept-Encoding: gzip, deflate"
```

**Expected Results:**

- With `Accept-Encoding`: Should see `Content-Encoding: gzip` header
- Without: No `Content-Encoding` header
- Response should be smaller when compressed

---

### 5. Security Headers Hooks

**Setup:**

```typescript
// src/hooks.ts
import {
    securityHeaders,
    strictSecurity,
} from '../ecosystem/hooks/security-headers/security-headers';

export const beforeRoute = [
    strictSecurity(), // or securityHeaders() for custom config
];
```

**Test Commands:**

```bash
# Check security headers
curl -i http://localhost:4000/api/test

# Verbose to see all headers
curl -v http://localhost:4000/api/test 2>&1 | grep -i "x-\|content-security\|strict-transport"
```

**Expected Results:**

- Should see `X-Frame-Options: DENY`
- Should see `X-Content-Type-Options: nosniff`
- Should see `Content-Security-Policy` header
- Should see `Strict-Transport-Security` header

---

### 6. Timeout Hooks

**Setup:**

```typescript
// src/hooks.ts
import { requestTimeout } from '../ecosystem/hooks/timeout/timeout';

export const beforeRoute = [
    requestTimeout({ ms: 2000 }), // 2 second timeout
];
```

**Create slow route** - `src/api/slow/route.ts`:

```typescript
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    // Simulate slow operation
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds
    return Response.json({ message: 'Done' });
}
```

**Test Commands:**

```bash
# Test normal route (should work)
curl -i http://localhost:4000/api/test

# Test slow route (should timeout)
curl -i http://localhost:4000/api/slow
```

**Expected Results:**

- Normal route: 200 OK
- Slow route: 408 Request Timeout

> Note: `requestTimeout` detects timeouts after the handler completes — the
> handler still runs to completion. For hard enforcement that stops handlers
> mid-execution, use `AbortSignal` inside the handler.

---

### 7. Cache Control Hooks

**Setup:**

```typescript
// src/hooks.ts
import { publicCache } from '../ecosystem/hooks/cache/cache';

export const beforeRoute = [
    publicCache(3600), // Cache for 1 hour
];
```

**Test Commands:**

```bash
# Check cache headers
curl -i http://localhost:4000/api/test

# Verify Cache-Control header
curl -i http://localhost:4000/api/test | grep -i cache-control
```

**Expected Results:**

- Should see `Cache-Control: public, max-age=3600`
- Response should include caching directives

---

### 8. Body Size Limiter Hooks

**Setup:**

```typescript
// src/hooks.ts
import { bodySizeLimiter } from '../ecosystem/hooks/body-size-limiter/body-size-limiter';

export const beforeRoute = [
    bodySizeLimiter({
        maxSize: 1024, // 1KB for easy testing
    }),
];
```

**Test Commands:**

```bash
# Test small payload (should work)
curl -i -X POST http://localhost:4000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test large payload (should fail)
curl -i -X POST http://localhost:4000/api/test \
  -H "Content-Type: application/json" \
  -d "$(printf '{"data":"%2000s"}' '')"

# Test with Content-Length header
curl -i -X POST http://localhost:4000/api/test \
  -H "Content-Type: application/json" \
  -H "Content-Length: 5000" \
  -d '{"test": "small"}'
```

**Expected Results:**

- Small payload: 200 OK
- Large payload: 413 Payload Too Large
- Should see error message with size information

---

## Testing Multiple Hooks Together

**Complete Setup:**

```typescript
// src/hooks.ts
import { cors } from '../ecosystem/hooks/cors/cors';
import { logger } from '../ecosystem/hooks/logger/logger';
import { rateLimit } from '../ecosystem/hooks/rate-limiter/rate-limiter';
import { compress } from '../ecosystem/hooks/compression/compression';
import { securityHeaders } from '../ecosystem/hooks/security-headers/security-headers';
import { bodySizeLimiter } from '../ecosystem/hooks/body-size-limiter/body-size-limiter';

export const onRequest = [
    cors({ origin: '*' }), // Enable CORS (pre-routing)
];

export const beforeRoute = [
    logger(), // Log all requests
    securityHeaders(), // Add security headers
    rateLimit({ maxRequests: 100 }), // Limit to 100 req/min
    compress({ threshold: 1024 }), // Compress responses
    bodySizeLimiter({ maxSize: 1048576 }), // 1MB limit
];

// index.ts
import { Burger } from 'burger-api';

const burger = new Burger({ apiDir: './src/api' });
burger.serve(4000, () => {
    console.log('🚀 Test server started on http://localhost:4000');
});
```

**Test All Features:**

```bash
# Test everything at once
curl -i -X POST http://localhost:4000/api/test \
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
// src/hooks.ts
import { createLogger } from '../ecosystem/hooks/logger/logger';

export const beforeRoute = [
    createLogger({
        colors: true,
        logHeaders: true,
        logQuery: true,
    }),
];
```

### 2. Test One Hook at a Time

Start with one hook and add more gradually:

```typescript
// src/hooks.ts
// Test 1: Just logger
export const beforeRoute = [logger()];

// Test 2: Logger + CORS
export const onRequest = [cors()];
export const beforeRoute = [logger()];

// Test 3: Logger + CORS + Rate Limiter
export const onRequest = [cors()];
export const beforeRoute = [logger(), rateLimit()];
```

### 3. Check Console Output

Watch the terminal for:

- Log messages from the logger hook
- Warning messages (e.g., brotli not supported)
- Error messages

### 4. Use Browser DevTools

Open http://localhost:4000/api/test in your browser and check:

- Network tab for headers
- Console for any JavaScript errors
- Response payload

---

## Automated Testing Script

Create `test-all.sh`:

```bash
#!/bin/bash

echo "🧪 Testing all hooks..."
echo ""

echo "1️⃣ Testing basic request..."
curl -s http://localhost:4000/api/test > /dev/null && echo "✅ Basic request OK" || echo "❌ Failed"

echo "2️⃣ Testing CORS..."
curl -s -H "Origin: http://example.com" http://localhost:4000/api/test | grep -q "Access-Control" && echo "✅ CORS OK" || echo "❌ Failed"

echo "3️⃣ Testing rate limit..."
for i in {1..6}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/test)
  if [ $i -eq 6 ] && [ $STATUS -eq 429 ]; then
    echo "✅ Rate limit OK"
    break
  fi
done

echo "4️⃣ Testing compression..."
curl -s -H "Accept-Encoding: gzip" http://localhost:4000/api/large -o /dev/null && echo "✅ Compression OK" || echo "❌ Failed"

echo "5️⃣ Testing security headers..."
curl -s -i http://localhost:4000/api/test | grep -q "X-Frame-Options" && echo "✅ Security headers OK" || echo "❌ Failed"

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

### Hooks Not Working?

1. **Check import paths**: Make sure imports point at `ecosystem/hooks/<name>/<name>`
2. **Check hook points**: `cors()` belongs in `onRequest` (pre-routing, for
   preflight); the rest belong in `beforeRoute` (or `afterRoute` /
   `mapResponse` for response decoration)
3. **Check Bun version**: Run `bun --version` (need v1.3.1+)
4. **Check console errors**: Look for any error messages
5. **Test hooks in isolation**: Remove other hooks temporarily

### Common Issues

**Issue**: "Cannot find module 'burger-api'"

- **Solution**: Run `bun add burger-api` in your test project

**Issue**: Hooks not applying to routes

- **Solution**: Make sure hooks are defined in `src/hooks.ts` (global, sibling
  of `index.ts`) or in a route's own `hooks.ts` next to `route.ts`. There are
  no folder-level or group-level hook files.

**Issue**: CORS not working

- **Solution**: Check that origin is correctly configured, and that `cors()`
  is in `onRequest` so preflight requests are answered before routing

**Issue**: Rate limiter always returns 429

- **Solution**: Restart server or increase `maxRequests`

**Issue**: Compression not working

- **Solution**: Ensure response is large enough (above threshold) and client
  sends `Accept-Encoding` header

---

## Next Steps

After testing:

1. ✅ Verify all hooks work as expected
2. ✅ Test edge cases (invalid inputs, errors, etc.)
3. ✅ Test hook combinations
4. ✅ Document any issues found
5. ✅ Create your own custom hook factory

---

## Reporting Issues

If you find any issues:

1. Note which hook has the issue
2. Include your test setup code
3. Include the exact error message
4. Include Bun version: `bun --version`
5. Include burger-api version: Check `package.json`

Happy testing! 🎉
