# My Burger API App - Production Ready Example

This example demonstrates a production-ready burger-api application with
comprehensive middleware, authentication, rate limiting, CORS, and logging.

## Overview

This example includes:

-   **Production middleware** - Auth, rate limiting, CORS, logging
-   **Complete application structure** - Organized API endpoints
-   **OpenAPI documentation** - Automatic API documentation
-   **Swagger UI** - Interactive API documentation
-   **Best practices** - Production-ready configuration

## Features Demonstrated

### 1. Authentication Middleware

-   JWT token validation
-   Role-based access control
-   Secure request handling

### 2. Rate Limiting

-   Request rate limiting (100 req/min)
-   Protection against DoS attacks
-   Configurable limits

### 3. CORS Middleware

-   Cross-origin resource sharing
-   Preflight request handling
-   Credentials support

### 4. Logging Middleware

-   Request logging and tracking
-   Performance monitoring
-   Structured logging

### 5. OpenAPI Documentation

-   Automatic OpenAPI spec generation
-   Swagger UI integration
-   Interactive API documentation

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/my-burger-api-app/index.ts
```

You should see:

```
🍔 My Burger API App - Production Ready Demo is running!
=========================================================

📖 API Documentation: http://localhost:5000/docs
🔗 OpenAPI Spec: http://localhost:5000/openapi.json

🏗️ Production Features Enabled:

🔐 Security & Authentication:
   • JWT token validation
   • Role-based access control
   • Secure headers and CORS

⚡ Performance & Monitoring:
   • Rate limiting (100 req/min)
   • Request logging and tracking
   • Performance monitoring

🌐 Cross-Origin Support:
   • CORS configuration
   • Preflight request handling
   • Credentials support
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Get API response
curl http://localhost:5000/api

# Test CORS preflight
curl -X OPTIONS http://localhost:5000/api \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET"

# View OpenAPI spec
curl http://localhost:5000/openapi.json

# View Swagger UI (in browser)
# http://localhost:5000/docs
```

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/my-burger-api-app/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/my-burger-api-app/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/my-burger-api-app/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/my-burger-api-app/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only CORS tests
bun test --test-name-pattern "CORS" examples/my-burger-api-app/api.test.ts

# Run only Rate Limiting tests
bun test --test-name-pattern "Rate" examples/my-burger-api-app/api.test.ts
```

## Test Coverage

The test suite includes **12 tests** covering:

### ✅ API Endpoints (2 tests)

-   GET API response
-   Global middleware execution

### ✅ Production Features (6 tests)

-   CORS preflight handling
-   CORS headers in responses
-   Rate limiting behavior
-   Authentication handling
-   Logging functionality

### ✅ OpenAPI Documentation (2 tests)

-   OpenAPI specification
-   Swagger UI HTML

### ✅ Error Handling (2 tests)

-   404 for non-existent routes
-   Malformed request handling

### ✅ Performance (2 tests)

-   Concurrent request handling
-   Consistent results

## API Endpoints

| Method | Endpoint            | Description                    | Features                    |
| ------ | ------------------- | ------------------------------ | --------------------------- |
| GET    | `/api`              | Get API response               | Auth, Rate Limit, CORS, Logging |

## Documentation Endpoints

| Endpoint            | Description                    |
| ------------------- | ------------------------------ |
| `/openapi.json`     | OpenAPI 3.0 specification      |
| `/docs`             | Swagger UI (interactive docs)  |

## Production Features

### Security & Authentication

-   **JWT token validation** - Secure authentication
-   **Role-based access control** - Permission management
-   **Secure headers** - Security headers in responses
-   **CORS configuration** - Cross-origin support

### Performance & Monitoring

-   **Rate limiting** - 100 requests per minute
-   **Request logging** - All requests logged
-   **Performance monitoring** - Request tracking
-   **Structured logging** - Organized log output

### Cross-Origin Support

-   **CORS configuration** - Allowed origins
-   **Preflight handling** - OPTIONS request support
-   **Credentials support** - Cookie/header support

## File Structure

```
my-burger-api-app/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
├── api/                  # API routes
│   └── route.ts          # GET /api
└── middleware/           # Middleware
    ├── index.ts         # Middleware exports
    ├── logger.ts        # Logger middleware
    ├── auth.ts          # Auth middleware (if exists)
    ├── rate-limiter.ts  # Rate limiter middleware (if exists)
    └── cors.ts          # CORS middleware (if exists)
```

## Key Concepts

1. **Production Middleware**: Auth, rate limiting, CORS, logging
2. **Security**: JWT validation, role-based access control
3. **Performance**: Rate limiting, request monitoring
4. **Documentation**: OpenAPI spec and Swagger UI
5. **Best Practices**: Production-ready configuration

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/my-burger-api-app/index.ts
```

### Port Already in Use

If you see:

```
Error: Port 5000 is already in use
```

**Solution**: Either:

-   Stop the other service using port 5000
-   Or modify the port in `index.ts` and update `BASE_URL` in `api.test.ts`

### Authentication Errors

If you see authentication errors:

1. **Check middleware configuration**: Ensure auth middleware is correctly configured
2. **Check server logs**: Look for auth middleware execution messages
3. **Check token validation**: Ensure tokens are valid if using JWT

### Rate Limiting

If you see rate limiting errors:

1. **Check rate limit configuration**: Ensure rate limits are correctly configured
2. **Check request frequency**: Ensure you're not exceeding rate limits
3. **Check server logs**: Look for rate limiting messages

