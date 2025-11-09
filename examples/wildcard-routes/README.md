# Wildcard Routes Example

This example demonstrates the wildcard routing feature of burger-api, showing
how to use `[...]` folder syntax to create routes that match multiple path
segments.

## Overview

This example includes:

-   **Static routes**: `/api/admin`, `/api/users`
-   **Wildcard routes**: `/api/admin/*`, `/api/auth/*`, `/api/users/:userId/*`
-   **Dynamic routes**: `/api/users/:userId`
-   **Nested dynamic routes**: `/api/users/:userId/posts/:postId`

## Features Demonstrated

### 1. Static Routes

-   `/api/admin` - Static admin route
-   `/api/users` - Static users list route

### 2. Wildcard Routes with Static Sibling

-   `/api/admin/*` - Wildcard route that handles any path after `/api/admin/`
-   Note: Static route `/api/admin` takes priority over wildcard

### 3. Wildcard Routes without Static Sibling

-   `/api/auth/*` - Wildcard route that handles both base path and nested paths
-   Handles: `/api/auth`, `/api/auth/login`, `/api/auth/logout`, etc.

### 4. Dynamic Routes

-   `/api/users/:userId` - Dynamic route with parameter validation

### 5. Wildcard Routes inside Dynamic Routes

-   `/api/users/:userId/*` - Wildcard route nested inside dynamic route
-   Handles: `/api/users/1/profile`, `/api/users/1/settings/privacy`, etc.

### 6. Nested Dynamic Routes

-   `/api/users/:userId/posts/:postId` - Nested dynamic route with multiple
    parameters

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/wildcard-routes/index.ts
```

You should see:

```
Loading route: /api/admin
Loading route: /api/admin/*
Loading route: /api/auth/*
...
🍔 BurgerAPI is running at: http://localhost:4000
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Test static admin route
curl http://localhost:4000/api/admin

# Test wildcard admin route
curl http://localhost:4000/api/admin/users

# Test auth wildcard route (base path)
curl http://localhost:4000/api/auth

# Test auth wildcard route (nested)
curl http://localhost:4000/api/auth/login

# Test dynamic user route
curl http://localhost:4000/api/users/1

# Test user wildcard route
curl http://localhost:4000/api/users/1/profile

# Test nested dynamic route
curl http://localhost:4000/api/users/1/posts/100
```

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/wildcard-routes/index.ts
    ```

2. **Run tests** (in another terminal):
    ```bash
    bun test examples/wildcard-routes/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/wildcard-routes/api.test.ts
```

#### Run Tests in Watch Mode

Automatically re-runs tests when files change:

```bash
bun test --watch examples/wildcard-routes/api.test.ts
```

#### Run Specific Test Group

Filter tests by name pattern:

```bash
# Run only Admin wildcard tests
bun test --test-name-pattern "Admin" examples/wildcard-routes/api.test.ts

# Run only Auth wildcard tests
bun test --test-name-pattern "Auth" examples/wildcard-routes/api.test.ts

# Run only Dynamic route tests
bun test --test-name-pattern "Dynamic" examples/wildcard-routes/api.test.ts
```

#### Run Single Test

```bash
bun test --test-name-pattern "should handle GET /api/admin" examples/wildcard-routes/api.test.ts
```

#### Run Tests with Coverage

```bash
bun test --coverage examples/wildcard-routes/api.test.ts
```

## Test Coverage

The test suite includes **56 tests** covering:

### ✅ Static Routes (3 tests)

-   GET `/api/admin`
-   GET `/api/users` with user list
-   404 for non-existent routes

### ✅ Admin Wildcard Routes (7 tests)

-   Single segment paths
-   Multiple segments
-   Deep nesting
-   Special characters
-   Empty segments

### ✅ Auth Wildcard Routes (8 tests)

-   Base path handling
-   All auth endpoints (login, logout, register, etc.)
-   Nested paths
-   Query parameters

### ✅ Dynamic Routes (8 tests)

-   Valid user IDs (1, 2, 3, 4)
-   Invalid user IDs (999, 0, -1, invalid)
-   Trailing slash handling

### ✅ User Wildcard Routes (12 tests)

-   Single segment paths
-   Multiple segments
-   Deep nesting
-   Edge cases (empty params, special characters, numeric segments)

### ✅ Nested Dynamic Routes (4 tests)

-   Various user/post combinations
-   Invalid route handling

### ✅ Route Priority (4 tests)

-   Static over wildcard
-   Dynamic over wildcard
-   Nested dynamic over wildcard
-   Wildcard when no exact match

### ✅ HTTP Methods (3 tests)

-   GET requests
-   HEAD requests
-   OPTIONS requests (CORS preflight)

### ✅ Error Handling (3 tests)

-   404 for non-existent routes
-   Malformed URLs
-   Very long paths

### ✅ Performance & Consistency (2 tests)

-   Consistent results
-   Concurrent requests

## Test Structure

The test file is organized into logical groups:

```
Wildcard Routes API
├── Static Routes
├── Admin Wildcard Routes (with static sibling)
├── Auth Wildcard Routes (no static sibling)
├── Dynamic Routes
│   ├── Valid User IDs
│   └── Invalid User IDs
├── User Wildcard Routes (inside dynamic route)
│   ├── Single Segment
│   ├── Multiple Segments
│   ├── Deep Nesting
│   └── Edge Cases
├── Nested Dynamic Routes
├── Route Priority
├── HTTP Methods
├── Error Handling
└── Performance & Consistency
```

## Understanding Route Priority

Routes are matched in the following priority order:

1. **Static routes** (highest priority)

    - `/api/admin` matches before `/api/admin/*`

2. **Dynamic routes**

    - `/api/users/:userId` matches before `/api/users/:userId/*`

3. **Nested dynamic routes**

    - `/api/users/:userId/posts/:postId` matches before `/api/users/:userId/*`

4. **Wildcard routes** (lowest priority)
    - `/api/users/:userId/*` matches when no exact route exists

## Example Routes

| Route Pattern                      | Example URL              | Matches                          |
| ---------------------------------- | ------------------------ | -------------------------------- |
| `/api/admin`                       | `/api/admin`             | ✅ Static route                  |
| `/api/admin/*`                     | `/api/admin/users`       | ✅ Wildcard route                |
| `/api/auth/*`                      | `/api/auth`              | ✅ Base path (no static sibling) |
| `/api/auth/*`                      | `/api/auth/login`        | ✅ Wildcard route                |
| `/api/users/:userId`               | `/api/users/1`           | ✅ Dynamic route                 |
| `/api/users/:userId/*`             | `/api/users/1/profile`   | ✅ Wildcard route                |
| `/api/users/:userId/posts/:postId` | `/api/users/1/posts/100` | ✅ Nested dynamic route          |

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/wildcard-routes/index.ts
```

### Tests Failing

1. **Check server is running**: Make sure the server is running on port 4000
2. **Check port conflicts**: Ensure no other service is using port 4000
3. **Check server logs**: Look at the server terminal for any errors

### Port Already in Use

If you see:

```
Error: Port 4000 is already in use
```

**Solution**: Either:

-   Stop the other service using port 4000
-   Or modify the port in `index.ts` and update `BASE_URL` in `api.test.ts`

## Additional Resources

-   [Burger API Documentation](https://burger-api.com)
-   [Bun Test Runner Documentation](https://bun.sh/docs/cli/test)
-   [Wildcard Routes Guide](https://burger-api.com/docs/routing/api/wildcard-routes)

## File Structure

```
wildcard-routes/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
└── api/                  # API routes
    ├── admin/
    │   ├── route.ts      # Static admin route
    │   └── [...]/
    │       └── route.ts  # Admin wildcard route
    ├── auth/
    │   └── [...]/
    │       └── route.ts  # Auth wildcard route
    └── users/
        ├── route.ts      # Static users route
        ├── [userId]/
        │   ├── route.ts  # Dynamic user route
        │   ├── [...]/
        │   │   └── route.ts  # User wildcard route
        │   └── posts/
        │       └── [postId]/
        │           └── route.ts  # Nested dynamic route
```

## Contributing

When adding new routes or tests:

1. Follow the existing folder structure
2. Add corresponding tests in `api.test.ts`
3. Update this README if needed
4. Ensure all tests pass before committing
