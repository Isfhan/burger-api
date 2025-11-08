# Route-Specific Middleware Example

This example demonstrates route-specific middleware in burger-api, showing
how to apply middleware to specific routes in addition to global middleware.

## Overview

This example includes:

-   **Global middleware** - Applied to all routes
-   **Route-specific middleware** - Applied only to specific routes
-   **Middleware combination** - Global and route-specific middleware working
    together
-   **Route groups** - Using `(group)` folders to organize routes

## Features Demonstrated

### 1. Global Middleware

-   Applied to all routes
-   Executed before route-specific middleware
-   Defined in `globalMiddleware` option

### 2. Route-Specific Middleware

-   Applied only to specific routes
-   Executed after global middleware
-   Defined in route file as `export const middleware`

### 3. Middleware Combination

-   Global middleware executes first
-   Route-specific middleware executes after
-   Both can modify request/response

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/route-specific-middleware/index.ts
```

You should see:

```
Loading route: /api/products
Loading route: /api/products/detail
Loading route: /api/profile/:id
✨ Server is running on port: 4000
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Get products list (global + route-specific middleware)
curl http://localhost:4000/api/products

# Get products with query parameters
curl "http://localhost:4000/api/products?search=test"

# Create a product
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 99.99}'

# Get product detail (global + route-specific middleware)
curl http://localhost:4000/api/products/detail

# Get profile by ID (global + route-specific middleware)
curl http://localhost:4000/api/profile/1
```

### Step 3: Check Middleware Execution

Watch the server terminal to see middleware execution logs:

-   Global middleware logs for all requests
-   Route-specific middleware logs for specific routes

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/route-specific-middleware/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/route-specific-middleware/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/route-specific-middleware/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/route-specific-middleware/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only Products tests
bun test --test-name-pattern "Products" examples/route-specific-middleware/api.test.ts

# Run only Profile tests
bun test --test-name-pattern "Profile" examples/route-specific-middleware/api.test.ts

# Run only Middleware tests
bun test --test-name-pattern "Middleware" examples/route-specific-middleware/api.test.ts
```

## Test Coverage

The test suite includes **12 tests** covering:

### ✅ Products API (5 tests)

-   GET products list
-   Query parameters handling
-   POST product creation
-   GET product detail
-   Route-specific middleware execution

### ✅ Profile API (3 tests)

-   GET profile by ID
-   Different profile IDs
-   Route-specific middleware execution

### ✅ Middleware Behavior (3 tests)

-   Global middleware execution
-   Route-specific middleware execution
-   Middleware combination

### ✅ Error Handling (2 tests)

-   404 for non-existent routes
-   404 for invalid nested routes

## API Endpoints

| Method | Endpoint                | Description                    | Middleware                    |
| ------ | ----------------------- | ------------------------------ | ----------------------------- |
| GET    | `/api/products`         | Get products list               | Global + Route-specific       |
| POST   | `/api/products`         | Create a new product           | Global + Route-specific       |
| GET    | `/api/products/detail`  | Get product detail             | Global + Route-specific       |
| GET    | `/api/profile/:id`      | Get profile by ID              | Global + Route-specific       |

## Middleware Execution Order

1. **Global middleware** (executes first)
2. **Route-specific middleware** (executes after global)
3. **Route handler** (executes last)

## File Structure

```
route-specific-middleware/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
├── api/                  # API routes
│   └── (group)/          # Route group (ignored in path)
│       ├── products/
│       │   ├── route.ts  # GET/POST /api/products (with middleware)
│       │   └── detail/
│       │       └── route.ts  # GET /api/products/detail (with middleware)
│       └── profile/
│           └── [id]/
│               └── route.ts  # GET /api/profile/:id (with middleware)
└── middleware/
    └── index.ts         # Global middleware
```

## Key Concepts

1. **Global Middleware**: Applied to all routes
2. **Route-Specific Middleware**: Applied only to specific routes
3. **Middleware Order**: Global executes before route-specific
4. **Middleware Combination**: Both can be used together
5. **Request/Response Modification**: Middleware can modify request/response

## Middleware Example

### Global Middleware

```typescript
// middleware/index.ts
export const globalMiddleware1: Middleware = (req: BurgerRequest): BurgerNext => {
    console.log('Global middleware executed for request:', req.url);
    return undefined;
};
```

### Route-Specific Middleware

```typescript
// api/products/route.ts
export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log('Products Route-specific middleware executed');
        return undefined;
    },
];
```

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/route-specific-middleware/index.ts
```

### Middleware Not Executing

If middleware is not executing:

1. **Check middleware definition**: Ensure middleware is correctly defined
2. **Check server logs**: Look for middleware execution messages
3. **Check route files**: Ensure route-specific middleware is exported
4. **Check global middleware**: Ensure global middleware is configured

