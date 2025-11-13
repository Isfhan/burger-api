# Nested Dynamic Routes Example

This example demonstrates nested dynamic routes in burger-api, showing how to
create routes with multiple dynamic segments and parameter validation.

## Overview

This example includes:

-   **Static routes** - `/api/users`
-   **Dynamic routes** - `/api/users/:userId`
-   **Nested dynamic routes** - `/api/users/:userId/posts/:postId`
-   **Parameter validation** - Using Zod schemas to validate route parameters

## Features Demonstrated

### 1. Static Routes

-   `/api/users` - Static route for users list

### 2. Dynamic Routes

-   `/api/users/:userId` - Dynamic route with single parameter
-   Validates `userId` parameter (string, min 1 character)

### 3. Nested Dynamic Routes

-   `/api/users/:userId/posts/:postId` - Nested dynamic route with multiple
    parameters
-   Validates both `userId` and `postId` parameters
-   Demonstrates route priority (nested routes take precedence)

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/nested-dynamic-routes/index.ts
```

You should see:

```
Loading route: /api/users
Loading route: /api/users/:userId
Loading route: /api/users/:userId/posts/:postId
🍔 BurgerAPI is running at: http://localhost:4000
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Get users list
curl http://localhost:4000/api/users

# Get user by ID
curl http://localhost:4000/api/users/1

# Get post by user and post ID
curl http://localhost:4000/api/users/1/posts/100
```

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/nested-dynamic-routes/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/nested-dynamic-routes/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/nested-dynamic-routes/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/nested-dynamic-routes/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only Users tests
bun test --test-name-pattern "Users" examples/nested-dynamic-routes/api.test.ts

# Run only Posts tests
bun test --test-name-pattern "posts" examples/nested-dynamic-routes/api.test.ts
```

## Test Coverage

The test suite includes **13 tests** covering:

### ✅ Users API (7 tests)

-   GET users list
-   GET user by ID (valid)
-   Different user IDs
-   Empty user ID validation

### ✅ Nested Posts API (5 tests)

-   GET post with valid IDs
-   Different user/post ID combinations
-   Empty user ID validation
-   Empty post ID validation
-   Special characters in IDs

### ✅ Route Priority (2 tests)

-   Static route priority
-   Nested route priority

### ✅ Error Handling (2 tests)

-   404 for non-existent routes
-   404 for invalid nested routes

## API Endpoints

| Method | Endpoint                          | Description                    | Validation                    |
| ------ | --------------------------------- | ------------------------------ | ----------------------------- |
| GET    | `/api/users`                      | Get users list                 | None                          |
| GET    | `/api/users/:userId`              | Get user by ID                 | `userId` (string, min 1)     |
| GET    | `/api/users/:userId/posts/:postId` | Get post by user and post ID | `userId` (string, min 1), `postId` (string, min 1) |

## Route Priority

Routes are matched in the following priority order:

1. **Static routes** (highest priority)
   - `/api/users` matches before `/api/users/:userId`

2. **Nested dynamic routes**
   - `/api/users/:userId/posts/:postId` matches before `/api/users/:userId`

3. **Dynamic routes** (lowest priority)
   - `/api/users/:userId` matches when no exact route exists

## File Structure

```
nested-dynamic-routes/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
└── api/                  # API routes
    └── users/
        ├── route.ts      # GET /api/users
        ├── [userId]/
        │   ├── route.ts  # GET /api/users/:userId
        │   └── posts/
        │       └── [postId]/
        │           └── route.ts  # GET /api/users/:userId/posts/:postId
```

## Key Concepts

1. **Nested Dynamic Routes**: Multiple dynamic segments in a single route
2. **Parameter Validation**: Using Zod schemas to validate route parameters
3. **Route Priority**: Understanding how routes are matched
4. **Type Safety**: TypeScript types inferred from Zod schemas
5. **File Structure**: How folder structure maps to route paths

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/nested-dynamic-routes/index.ts
```

### Route Not Matching

If routes are not matching correctly:

1. **Check route priority**: Static routes match before dynamic routes
2. **Check nested routes**: Nested routes match before parent routes
3. **Check parameter validation**: Ensure parameters meet validation requirements
4. **Check file structure**: Ensure files are in correct locations

