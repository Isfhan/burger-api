# Zod-Based Schema Validation Example

This example demonstrates Zod-based schema validation in burger-api, showing
how to validate query parameters and request body using Zod schemas.

## Overview

This example includes:

-   **Product API** with Zod validation
-   **Query parameter validation** for GET requests
-   **Request body validation** for POST requests
-   **Parameter validation** for dynamic routes
-   **Route-specific middleware** for logging

## Features Demonstrated

### 1. Query Parameter Validation (GET /api/products)

-   Validates `search` query parameter (required string)
-   Returns validation errors for missing or invalid parameters

### 2. Request Body Validation (POST /api/products)

-   Validates request body with Zod
-   Requires `name` (string, min 1 character)
-   Requires `price` (number, must be positive)
-   Returns validation errors for invalid data

### 3. Parameter Validation (GET /api/products/:id)

-   Validates URL parameter `id` (number, min 1)
-   Returns validation errors for invalid IDs

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/zod-based-schema-validation/index.ts
```

You should see:

```
Loading route: /api/products
Loading route: /api/products/:id
✨ Server is running on port: 4000
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Get products with search query (valid)
curl "http://localhost:4000/api/products?search=test"

# Get products without search query (invalid)
curl "http://localhost:4000/api/products"

# Create a product (valid)
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 99.99}'

# Create a product (invalid - missing name)
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"price": 99.99}'

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
    bun run examples/zod-based-schema-validation/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/zod-based-schema-validation/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/zod-based-schema-validation/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/zod-based-schema-validation/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only GET tests
bun test --test-name-pattern "GET" examples/zod-based-schema-validation/api.test.ts

# Run only POST tests
bun test --test-name-pattern "POST" examples/zod-based-schema-validation/api.test.ts
```

## Test Coverage

The test suite includes **18 tests** covering:

### ✅ GET /api/products (5 tests)

-   Valid query parameter
-   Missing search parameter
-   Empty search parameter
-   Special characters in search
-   Multiple words in search

### ✅ POST /api/products (8 tests)

-   Valid product creation
-   Missing name validation
-   Missing price validation
-   Empty name validation
-   Invalid price (negative)
-   Invalid price (zero)
-   Invalid data types
-   Decimal price handling

### ✅ GET /api/products/:id (4 tests)

-   Valid ID
-   Invalid ID (non-numeric)
-   Invalid ID (zero)
-   Invalid ID (negative)

### ✅ Validation Edge Cases (3 tests)

-   Very long search strings
-   Special characters in search
-   Unicode characters in product name

## API Endpoints

| Method | Endpoint            | Description                    | Validation                    |
| ------ | ------------------- | ------------------------------ | ----------------------------- |
| GET    | `/api/products`     | Get products with search       | `search` (string, required)   |
| POST   | `/api/products`     | Create a new product           | `name` (string, min 1), `price` (number, positive) |
| GET    | `/api/products/:id` | Get product by ID              | `id` (number, min 1)          |

## Validation Examples

### Valid Requests

```json
// GET /api/products?search=test
{
  "query": { "search": "test" },
  "name": "John Doe"
}

// POST /api/products
{
  "name": "Test Product",
  "price": 99.99
}
```

### Invalid Requests

```json
// GET /api/products (missing search)
// Returns 400: search is required

// POST /api/products (missing name)
{
  "price": 99.99
}
// Returns 400: name is required

// POST /api/products (invalid price)
{
  "name": "Test Product",
  "price": -10
}
// Returns 400: price must be positive
```

## File Structure

```
zod-based-schema-validation/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
├── api/                  # API routes
│   └── products/
│       ├── route.ts      # GET/POST /api/products
│       └── [id]/
│           └── route.ts  # GET /api/products/:id
└── middleware/
    └── index.ts         # Global middleware
```

## Key Concepts

1. **Zod Validation**: Using Zod schemas to validate request data
2. **Query Parameters**: Validating query string parameters
3. **Request Body**: Validating JSON request body
4. **URL Parameters**: Validating dynamic route parameters
5. **Type Safety**: TypeScript types inferred from Zod schemas
6. **Error Handling**: Proper error responses for validation failures

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/zod-based-schema-validation/index.ts
```

### Validation Errors

If you see validation errors, check:

1. **Query Parameters**: Required parameters are present
2. **Request Body**: Format is valid JSON
3. **Required Fields**: All required fields are present
4. **Data Types**: Types match schema (name: string, price: number)
5. **Validation Rules**: Values meet schema requirements

