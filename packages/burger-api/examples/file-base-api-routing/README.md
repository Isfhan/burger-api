# File-Based API Routing Example

This example demonstrates file-based API routing in burger-api, showing how
routes are automatically discovered from the file structure.

## Overview

This example includes:

-   **File-based routing** - Routes automatically discovered from file structure
-   **Route groups** - Using `(group)` folders to organize routes
-   **Dynamic routes** - Using `[id]` folders for dynamic segments
-   **Nested routes** - Routes with multiple path segments

## Features Demonstrated

### 1. File-Based Routing

Routes are automatically discovered from the file structure:

-   `api/products/route.ts` → `/api/products`
-   `api/products/detail/route.ts` → `/api/products/detail`
-   `api/profile/[id]/route.ts` → `/api/profile/:id`

### 2. Route Groups

Folders with parentheses `(group)` are used for organization but don't appear
in the route path:

-   `api/(group)/products/route.ts` → `/api/products` (not `/api/(group)/products`)

### 3. Dynamic Routes

Folders with brackets `[id]` create dynamic route segments:

-   `api/profile/[id]/route.ts` → `/api/profile/:id`

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/file-base-api-routing/index.ts
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
# Get products list
curl http://localhost:4000/api/products

# Get products with query parameters
curl "http://localhost:4000/api/products?search=test"

# Create a product
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 99.99}'

# Get product detail
curl http://localhost:4000/api/products/detail

# Get profile by ID
curl http://localhost:4000/api/profile/1
```

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/file-base-api-routing/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/file-base-api-routing/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/file-base-api-routing/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/file-base-api-routing/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only Products tests
bun test --test-name-pattern "Products" examples/file-base-api-routing/api.test.ts

# Run only Profile tests
bun test --test-name-pattern "Profile" examples/file-base-api-routing/api.test.ts
```

## Test Coverage

The test suite includes **12 tests** covering:

### ✅ Products API (4 tests)

-   GET products list
-   Query parameters handling
-   POST product creation
-   GET product detail

### ✅ Profile API (3 tests)

-   GET profile by ID
-   Different profile IDs
-   Special characters in ID

### ✅ Route Groups (2 tests)

-   Grouped routes handling
-   Group name not in route path

### ✅ Error Handling (2 tests)

-   404 for non-existent routes
-   404 for invalid nested routes

## API Endpoints

| Method | Endpoint                | Description                    | File Path                          |
| ------ | ----------------------- | ------------------------------ | ---------------------------------- |
| GET    | `/api/products`         | Get products list               | `api/(group)/products/route.ts`    |
| POST   | `/api/products`         | Create a new product           | `api/(group)/products/route.ts`    |
| GET    | `/api/products/detail`  | Get product detail             | `api/(group)/products/detail/route.ts` |
| GET    | `/api/profile/:id`      | Get profile by ID              | `api/(group)/profile/[id]/route.ts` |

## File Structure

```
file-base-api-routing/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
├── api/                  # API routes
│   └── (group)/          # Route group (ignored in path)
│       ├── products/
│       │   ├── route.ts  # GET/POST /api/products
│       │   └── detail/
│       │       └── route.ts  # GET /api/products/detail
│       └── profile/
│           └── [id]/
│               └── route.ts  # GET /api/profile/:id
└── middleware/
    └── index.ts         # Global middleware
```

## Key Concepts

1. **File-Based Routing**: Routes automatically discovered from file structure
2. **Route Groups**: Use `(group)` folders to organize routes without affecting paths
3. **Dynamic Routes**: Use `[id]` folders to create dynamic route segments
4. **Nested Routes**: Create nested paths by organizing files in folders
5. **Route Discovery**: Framework automatically scans and registers routes

## Route Naming Conventions

-   **Static routes**: `route.ts` files in folders
-   **Dynamic routes**: `[paramName]` folders
-   **Route groups**: `(groupName)` folders (ignored in path)
-   **Nested routes**: Multiple folder levels

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/file-base-api-routing/index.ts
```

### Routes Not Loading

If routes are not loading:

1. **Check file structure**: Ensure `route.ts` files are in correct locations
2. **Check file names**: Route files must be named `route.ts`
3. **Check server logs**: Look for route loading messages
4. **Check API directory**: Ensure `apiDir` is correctly configured

