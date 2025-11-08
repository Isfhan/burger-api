# File-Based Static Page Routing App Example

This example demonstrates both API routing and static page routing in
burger-api, showing how to serve both API endpoints and static HTML pages from
the same application.

## Overview

This example includes:

-   **API routes** - RESTful API endpoints
-   **Static pages** - HTML pages served from file structure
-   **Assets** - CSS and JavaScript files
-   **Coexistence** - API and static pages working together

## Features Demonstrated

### 1. API Routes

-   `/api/products` - Products API endpoint
-   `/api/products/:id` - Dynamic product route
-   `/api/products/detail` - Product detail route

### 2. Static Pages

-   `/` - Home page
-   `/my-static` - Static page with assets
-   `/my-static-2` - Another static page
-   `/user/:id` - Dynamic user page
-   `/user/:id/post` - Nested dynamic page

### 3. Assets

-   CSS files served from `/assets/css/`
-   JavaScript files served from `/assets/js/`

## Running the Example

### Step 1: Start the Server

In your terminal, navigate to the project root and run:

```bash
bun run examples/file-base-static-page-routing-app/index.ts
```

You should see:

```
Loading route: /api/products
Loading route: /api/products/detail
Loading route: /api/products/:id
🚀 Server is running on port 4000
```

### Step 2: Test the API

Open another terminal and test the API endpoints:

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

# Get product by ID
curl http://localhost:4000/api/products/1
```

### Step 3: View Static Pages

Open your browser and visit:

-   `http://localhost:4000/` - Home page
-   `http://localhost:4000/my-static` - Static page
-   `http://localhost:4000/my-static-2` - Another static page
-   `http://localhost:4000/user/1` - Dynamic user page
-   `http://localhost:4000/user/1/post` - Nested dynamic page

## Running Tests

This example includes a test suite for API endpoints using Bun's built-in
test runner. Note: Static page routing is not tested here.

### Prerequisites

1. **Start the server first** (in one terminal):

    ```bash
    bun run examples/file-base-static-page-routing-app/index.ts
    ```

2. **Run tests** (in another terminal):

    ```bash
    bun test examples/file-base-static-page-routing-app/api.test.ts
    ```

### Test Commands

#### Run All Tests

```bash
bun test examples/file-base-static-page-routing-app/api.test.ts
```

#### Run Tests in Watch Mode

```bash
bun test --watch examples/file-base-static-page-routing-app/api.test.ts
```

## Test Coverage

The test suite includes **10 tests** covering:

### ✅ Products API (7 tests)

-   GET products list
-   Query parameters handling
-   POST product creation
-   GET product detail
-   GET product by ID
-   Different product IDs
-   Query parameters with product ID

### ✅ API and Static Pages Coexistence (2 tests)

-   API routes handling
-   No interference with static pages

### ✅ Error Handling (2 tests)

-   404 for non-existent API routes
-   404 for invalid nested API routes

## API Endpoints

| Method | Endpoint                | Description                    |
| ------ | ----------------------- | ------------------------------ |
| GET    | `/api/products`           | Get products list               |
| POST   | `/api/products`          | Create a new product           |
| GET    | `/api/products/detail`  | Get product detail             |
| GET    | `/api/products/:id`     | Get product by ID              |

## Static Pages

| Path                  | Description                    |
| --------------------- | ------------------------------ |
| `/`                   | Home page                      |
| `/my-static`          | Static page with assets        |
| `/my-static-2`        | Another static page            |
| `/my-static-2/product` | Product page                  |
| `/user/:id`           | Dynamic user page              |
| `/user/:id/post`      | Nested dynamic user post page  |

## File Structure

```
file-base-static-page-routing-app/
├── README.md              # This file
├── index.ts              # Server entry point
├── api.test.ts           # Test suite (API only)
├── api/                  # API routes
│   └── products/
│       ├── route.ts      # GET/POST /api/products
│       ├── detail/
│       │   └── route.ts  # GET /api/products/detail
│       └── [id]/
│           └── route.ts  # GET /api/products/:id
├── pages/                # Static pages
│   ├── index.html        # Home page
│   ├── my-static/
│   │   ├── index.html    # Static page
│   │   ├── app.css       # CSS file
│   │   └── app.js        # JavaScript file
│   ├── my-static-2/
│   │   ├── index.html    # Another static page
│   │   └── product.html  # Product page
│   └── user/
│       └── [id]/
│           ├── index.html      # User page
│           └── post/
│               └── index.html  # User post page
├── assets/               # Static assets
│   ├── css/
│   │   └── app.css       # Global CSS
│   └── js/
│       └── app.js        # Global JavaScript
└── middleware/
    └── logger.ts         # Global logger middleware
```

## Key Concepts

1. **API Routes**: RESTful API endpoints for data operations
2. **Static Pages**: HTML pages served from file structure
3. **Assets**: CSS and JavaScript files served statically
4. **Coexistence**: API and static pages working together
5. **File Structure**: Separate directories for API and pages

## Troubleshooting

### Server Not Running Error

If you see:

```
❌ Server is not running!
```

**Solution**: Start the server first:

```bash
bun run examples/file-base-static-page-routing-app/index.ts
```

### Static Pages Not Loading

If static pages are not loading:

1. **Check file structure**: Ensure HTML files are in `pages/` directory
2. **Check file names**: Static pages should be named `index.html`
3. **Check server logs**: Look for page loading messages
4. **Check page directory**: Ensure `pageDir` is correctly configured

### API Routes Not Working

If API routes are not working:

1. **Check file structure**: Ensure `route.ts` files are in `api/` directory
2. **Check file names**: Route files must be named `route.ts`
3. **Check server logs**: Look for route loading messages
4. **Check API directory**: Ensure `apiDir` is correctly configured

