# OpenAPI and Swagger UI Example

This example demonstrates automatic OpenAPI specification generation and
Swagger UI integration in burger-api, showing how to document your API
automatically.

## Overview

This example includes:

-   **Automatic OpenAPI generation** - OpenAPI 3.0 spec generated from routes
-   **Swagger UI integration** - Interactive API documentation
-   **Route metadata** - Custom OpenAPI metadata for routes
-   **Schema validation** - Zod schemas (small descriptions of the expected data
    shape) automatically converted to OpenAPI

## Features Demonstrated

### 1. Automatic OpenAPI Generation

-   OpenAPI 3.0 specification generated automatically
-   Available at `/openapi.json`
-   Includes all routes, schemas, and metadata

### 2. Swagger UI Integration

-   Interactive API documentation
-   Available at `/docs`
-   Automatically loads OpenAPI spec

### 3. Route Metadata

-   Custom OpenAPI metadata for routes
-   Summary, description, tags, operationId
-   Request/response schemas

### 4. Schema Validation

-   Zod schemas automatically converted to OpenAPI
-   Request body validation
-   Parameter validation

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/openapi-and-swagger-ui/index.ts
```

You should see:

```
Loading route: /api/products
Loading route: /api/products/:id
🚀 Server is running on port 4000
```

### Step 2: Test the API

Open another terminal and test the endpoints:

```bash
# Get products list
curl http://localhost:4000/api/products

# Create a product
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 99.99}'

# Get product by ID
curl http://localhost:4000/api/products/1
```

### Step 3: View Documentation

Open your browser and visit:

-   `http://localhost:4000/docs` - Swagger UI (interactive documentation)
-   `http://localhost:4000/openapi.json` - OpenAPI specification (JSON)

## Running Tests

This example includes a comprehensive test suite using Bun's built-in test
runner.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/openapi-and-swagger-ui/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/openapi-and-swagger-ui/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/openapi-and-swagger-ui/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/openapi-and-swagger-ui/api.test.ts
```

#### Run Specific Test Group

```bash
# Run only OpenAPI tests
bun test --test-name-pattern "OpenAPI" examples/openapi-and-swagger-ui/api.test.ts

# Run only Products tests
bun test --test-name-pattern "Products" examples/openapi-and-swagger-ui/api.test.ts
```

## Test Coverage

The test suite includes **14 tests** covering:

### ✅ Products API (6 tests)

-   GET products list
-   Query parameters handling
-   POST product creation (valid)
-   POST product creation (invalid)
-   GET product by ID (valid)
-   GET product by ID (invalid)

### ✅ OpenAPI Documentation (5 tests)

-   OpenAPI specification structure
-   API paths in spec
-   Operation metadata
-   Request body schema
-   Parameter schemas

### ✅ Swagger UI (2 tests)

-   Swagger UI HTML response
-   Swagger UI configuration

### ✅ Error Handling (2 tests)

-   404 for non-existent routes
-   404 for invalid nested routes

## API Endpoints

| Method | Endpoint                | Description                    | OpenAPI Metadata              |
| ------ | ----------------------- | ------------------------------ | ----------------------------- |
| GET    | `/api/products`         | Get products list               | None                          |
| POST   | `/api/products`         | Create a new product           | Summary, description, tags, operationId |
| GET    | `/api/products/:id`     | Get product by ID              | Summary, description, tags, operationId |

## Documentation Endpoints

| Endpoint            | Description                    |
| ------------------- | ------------------------------ |
| `/openapi.json`     | OpenAPI 3.0 specification      |
| `/docs`             | Swagger UI (interactive docs)  |

## OpenAPI Metadata Example

```typescript
export const openapi = {
    post: {
        summary: 'Create a Product',
        description: 'Creates a new product. Requires name and price in the request body.',
        tags: ['Product'],
        operationId: 'createProduct',
    },
};
```

## File Structure

```
openapi-and-swagger-ui/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite
├── api/                  # API routes
│   └── products/
│       ├── route.ts      # GET/POST /api/products
│       └── [id]/
│           └── route.ts  # GET /api/products/:id
└── middleware/
    └── logger.ts         # Global logger middleware
```

## Key Concepts

1. **Automatic OpenAPI Generation**: Framework generates OpenAPI spec from routes
2. **Swagger UI Integration**: Interactive documentation automatically available
3. **Route Metadata**: Custom OpenAPI metadata for routes
4. **Schema Conversion**: Zod schemas automatically converted to OpenAPI
5. **Type Safety**: TypeScript types inferred from Zod schemas

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/openapi-and-swagger-ui/index.ts
```

### OpenAPI Spec Not Loading

If OpenAPI spec is not loading:

1. **Check server is running**: Ensure server is running on port 4000
2. **Check route loading**: Look for route loading messages in server logs
3. **Check OpenAPI endpoint**: Visit `http://localhost:4000/openapi.json`

### Swagger UI Not Loading

If Swagger UI is not loading:

1. **Check server is running**: Ensure server is running on port 4000
2. **Check OpenAPI spec**: Ensure `/openapi.json` is accessible
3. **Check browser console**: Look for JavaScript errors
4. **Check network tab**: Look for failed requests

