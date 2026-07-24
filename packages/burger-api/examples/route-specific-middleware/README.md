# Route-Specific Hooks Example

This example demonstrates route-specific hooks in burger-api, showing
how to apply hooks to specific routes in addition to global hooks.
Hooks are code that runs around your handler — before and/or after it.

## Overview

This example includes:

-   **Global hooks** - Applied to all routes
-   **Route-specific hooks** - Applied only to specific routes
-   **Hooks combination** - Global and route-specific hooks working
    together
-   **Route groups** - Using `(group)` folders to organize routes

## Features Demonstrated

### 1. Global Hooks

-   Applied to all routes
-   Executed before route-specific hooks
-   Defined in `api/hooks.ts`

### 2. Route-Specific Hooks

-   Applied only to specific routes
-   Executed after global hooks
-   Defined in route `hooks.ts` as `export const beforeHandle`

### 3. Hooks Combination

-   Global hooks execute first
-   Route-specific hooks execute after
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
# Get products list (global + route-specific hooks)
curl http://localhost:4000/api/products

# Get products with query parameters
curl "http://localhost:4000/api/products?search=test"

# Create a product
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 99.99}'

# Get product detail (global + route-specific hooks)
curl http://localhost:4000/api/products/detail

# Get profile by ID (global + route-specific hooks)
curl http://localhost:4000/api/profile/1
```

### Step 3: Check Hooks Execution

Watch the server terminal to see hooks execution logs:

-   Global hooks log for all requests
-   Route-specific hooks log for specific routes

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

# Run only Hooks tests
bun test --test-name-pattern "Hooks" examples/route-specific-middleware/api.test.ts
```

## Test Coverage

The test suite includes **12 tests** covering:

### ✅ Products API (5 tests)

-   GET products list
-   Query parameters handling
-   POST product creation
-   GET product detail
-   Route-specific hooks execution

### ✅ Profile API (3 tests)

-   GET profile by ID
-   Different profile IDs
-   Route-specific hooks execution

### ✅ Hooks Behavior (3 tests)

-   Global hooks execution
-   Route-specific hooks execution
-   Hooks combination

### ✅ Error Handling (2 tests)

-   404 for non-existent routes
-   404 for invalid nested routes

## API Endpoints

| Method | Endpoint                | Description                    | Hooks                        |
| ------ | ----------------------- | ------------------------------ | ----------------------------- |
| GET    | `/api/products`         | Get products list               | Global + Route-specific       |
| POST   | `/api/products`         | Create a new product           | Global + Route-specific       |
| GET    | `/api/products/detail`  | Get product detail             | Global + Route-specific       |
| GET    | `/api/profile/:id`      | Get profile by ID              | Global + Route-specific       |

## Hooks Execution Order

1. **Global hooks** (executes first)
2. **Route-specific hooks** (executes after global)
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
│   │   ├── route.ts  # GET/POST /api/products
│   │   ├── hooks.ts  # Route-specific hooks
│   │   └── detail/
│   │       └── route.ts  # GET /api/products/detail
│       └── profile/
│           └── [id]/
│               ├── route.ts  # GET /api/profile/:id
│               └── hooks.ts  # Route-specific hooks
└── api/
    └── hooks.ts         # Global hooks
```

## Key Concepts

1. **Global Hooks**: Applied to all routes (defined in `api/hooks.ts`)
2. **Route-Specific Hooks**: Applied only to specific routes (defined in route `hooks.ts`)
3. **Hooks Order**: Global executes before route-specific
4. **Hooks Combination**: Both can be used together
5. **Request/Response Modification**: Hooks can modify request/response

## Hooks Example

### Global Hooks

```typescript
// api/hooks.ts
import type { BurgerRequest, BurgerNext } from 'burger-api';

export const beforeHandle = [
    (req: BurgerRequest): BurgerNext => {
        console.log('Global hook executed for request:', req.url);
        return undefined;
    },
];
```

### Route-Specific Hooks

```typescript
// api/products/hooks.ts
import type { BurgerRequest, BurgerNext } from 'burger-api';

export const beforeHandle = [
    (req: BurgerRequest): BurgerNext => {
        console.log('Products route-specific hook executed');
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

### Hooks Not Executing

If hooks are not executing:

1. **Check hooks definition**: Ensure hooks are correctly defined in `hooks.ts`
2. **Check server logs**: Look for hooks execution messages
3. **Check route files**: Ensure route-specific hooks are exported via `beforeHandle`
4. **Check global hooks**: Ensure `api/hooks.ts` exports a `beforeHandle` array

