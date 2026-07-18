# Error Handling Example

This example demonstrates error handling and validation in burger-api, showing
how to handle validation errors, invalid requests, and edge cases.

## Overview

This example includes:

-   **Product API** with validation
-   **Error handling** for invalid requests
-   **Zod validation** for request body and parameters
-   **Route-specific middleware** for logging (middleware is code that runs
    around your handler)

## Features Demonstrated

### 1. Product Creation (POST /api/products)

-   Validates request body with Zod
-   Requires `name` (string, min 1 character)
-   Requires `price` (number, must be positive)
-   Returns validation errors for invalid data

### 2. Product Detail (GET /api/products/detail)

-   Static route for product details
-   Simple GET endpoint

### 3. Product by ID (GET /api/products/:id)

-   Dynamic route with parameter validation
-   Validates ID as number (min 1)
-   Supports optional query parameters
-   Returns validation errors for invalid IDs

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/error-handling/index.ts
```

You should see:

```
Loading route: /api/products
Loading route: /api/products/detail
Loading route: /api/products/:id
🚀 Server is running on port 4000
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Create a product (valid)
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 99.99}'

# Create a product (invalid - missing name)
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"price": 99.99}'

# Get product detail
curl http://localhost:4000/api/products/detail

# Get product by ID (valid)
curl http://localhost:4000/api/products/1

# Get product by ID (invalid)
curl http://localhost:4000/api/products/invalid
```

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/error-handling/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/error-handling/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/error-handling/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/error-handling/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only POST tests
bun test --test-name-pattern "POST" examples/error-handling/api.test.ts

# Run only GET tests
bun test --test-name-pattern "GET" examples/error-handling/api.test.ts
```

## Test Coverage

The test suite includes **15 tests** covering:

### ✅ Product Creation (6 tests)

-   Valid product creation
-   Missing name validation
-   Missing price validation
-   Invalid price (negative) validation
-   Empty name validation
-   Invalid data types validation

### ✅ Product Detail (1 test)

-   GET product detail

### ✅ Product by ID (6 tests)

-   Valid ID with query parameter
-   Invalid ID (non-numeric)
-   Invalid ID (zero)
-   Invalid ID (negative)
-   Large valid IDs

### ✅ Error Handling (3 tests)

-   404 for non-existent routes
-   405 for unsupported methods
-   Malformed JSON handling

## API Endpoints

| Method | Endpoint                | Description                    | Validation                    |
| ------ | ----------------------- | ------------------------------ | ----------------------------- |
| POST   | `/api/products`         | Create a new product           | `name` (string, min 1), `price` (number, positive) |
| GET    | `/api/products/detail`  | Get product detail             | None                          |
| GET    | `/api/products/:id`     | Get product by ID              | `id` (number, min 1), optional `search` query |

## Validation Examples

### Valid Request

```json
{
  "name": "Test Product",
  "price": 99.99
}
```

### Invalid Requests

```json
// Missing name
{
  "price": 99.99
}

// Invalid price (negative)
{
  "name": "Test Product",
  "price": -10
}

// Empty name
{
  "name": "",
  "price": 99.99
}
```

## File Structure

```
error-handling/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
├── api/                  # API routes
│   └── products/
│       ├── route.ts      # POST /api/products
│       ├── detail/
│       │   └── route.ts  # GET /api/products/detail
│       └── [id]/
│           └── route.ts  # GET /api/products/:id
└── middleware/
    └── logger.ts         # Global logger middleware
```

## Key Concepts

1. **Validation**: Using Zod schemas to validate request data
2. **Error Handling**: Proper error responses for invalid requests
3. **Type Safety**: TypeScript types inferred from Zod schemas
4. **Middleware**: Route-specific middleware for logging

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/error-handling/index.ts
```

### Validation Errors

If you see validation errors, check:

1. Request body format (must be valid JSON)
2. Required fields are present
3. Data types match schema (name: string, price: number)
4. Validation rules (name min 1 char, price must be positive)

