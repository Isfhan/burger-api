<p align="center">
  <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342" alt="BurgerAPI logo"/>
</p>

[![Under Development](https://img.shields.io/badge/under%20development-red.svg)](https://github.com/isfhan/burger-api)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./packages/burger-api/LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2.20-black?logo=bun)](https://bun.sh)
[![Version](https://img.shields.io/badge/version-0.6.2-green.svg)](https://github.com/isfhan/burger-api/releases)

**burger-api** is a modern, open source API framework built on
[Bun.js](https://bun.sh). It combines the simplicity of file-based routing with
powerful features like built-in middleware, Zod-based schema validation, and
automatic OpenAPI generation. Designed for high performance and ease-of-use,
burger-api leverages Bun's native modules to deliver blazing-fast API responses
while keeping your codebase clean and maintainable.

**This project is under active development and should not be used in production
yet.**

## 📚 Table of Contents

-   [Overview](#-overview)
-   [CLI Tool](#-cli-tool)
-   [Changelog](#-changelog)
-   [What's Coming Next](#-whats-coming-next)
-   [Contributing](#-contributing)
-   [License](#-license)

## 📖 Documentation

For detailed documentation and examples, visit the
[BurgerAPI official docs](https://burger-api.com/).

## 🚀 Overview

burger-api is built to offer a robust developer experience through:

-   ⚡ **Bun-Native Performance:**  
    Leverages Bun's high-performance HTTP server.

-   📁 **File-Based Routing:**  
    Automatically registers API routes from your file structure using a clear
    naming convention.

-   🔄 **Middleware Architecture:**  
    Supports both global and route-specific middleware. Simple, powerful
    middleware system with three return types:

    -   `Response` - Stop here, send this response
    -   `Function` - Transform the final response after handler runs
    -   `undefined` - Continue to next middleware

-   ✅ **Type-Safe Validation:**  
    Utilizes Zod for request validation, ensuring full type safety and automatic
    error reporting.

-   📚 **Automatic OpenAPI Generation:**  
    Generates a complete OpenAPI 3.0 specification directly from your routes and
    Zod schemas.

-   🔍 **Swagger UI Integration:**  
    Out-of-the-box Swagger UI endpoint for interactive API documentation.

## 🛠️ CLI Tool

burger-api comes with a powerful CLI tool that makes it easy to scaffold new
projects and manage middleware. Install it globally to get started:

### Installation

**macOS, Linux, WSL:**
```bash
curl -fsSL https://burger-api.com/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://burger-api.com/install.ps1 | iex
```

Or download the executable from [GitHub Releases](https://github.com/isfhan/burger-api/releases/latest).

### Quick Start

```bash
# Create a new burger-api project
burger-api create my-api

# Navigate to your project
cd my-api

# Start development server
bun run dev
```

### Installing Middleware

The CLI makes it easy to add production-ready middleware to your project. Browse
available middleware and install them with a single command:

```bash
# List all available middleware
burger-api list

# Add middleware to your project
burger-api add cors logger rate-limiter
```

**Popular Middleware Available:**

-   **`cors`** - Cross-Origin Resource Sharing for handling cross-origin requests
-   **`logger`** - Request/response logging with detailed information
-   **`rate-limiter`** - Request rate limiting to prevent API abuse
-   **`jwt-auth`** - JWT authentication for securing your API endpoints
-   **`api-key-auth`** - API key authentication for server-to-server communication
-   **`compression`** - Response compression (gzip/deflate) to reduce bandwidth
-   **`security-headers`** - Security HTTP headers to protect against common attacks
-   **`cache`** - HTTP caching headers for improved performance
-   **`timeout`** - Request timeout to prevent long-running requests
-   **`body-size-limiter`** - Request body size limits to prevent large payload attacks

After installing middleware, the CLI will show you exactly how to use it in your
project. For more information, visit the [CLI documentation](../../packages/cli/README.md).

## 📣 Changelog

### Latest Version: 0.6.2 (November 13, 2025)

-   ⚡ **Major Performance Improvements:**

    -   middleware execution with specialized fast paths
    -   AOT compilation with pre-computed middleware arrays
    -   Zero runtime allocations (pre-allocated arrays)
    -   Manual loop unrolling for 2-middleware case
    -   Reduced code from ~110 to ~80 lines

-   🎯 **Simplified Middleware System:**

    -   Clearer return types: Response, Function, or undefined
    -   Removed complex "around" middleware pattern
    -   Dedicated fast paths for 0, 1, and 2 middlewares
    -   Better JIT optimization

-   📦 **Monorepo Structure:**

    -   Converted to Bun workspace monorepo
    -   Core framework in `packages/burger-api`
    -   CLI tool in `packages/cli` (under development)
    -   Ecosystem middleware at root level

-   🔧 **Developer Experience:**
    -   100% backward compatible
    -   Clearer documentation
    -   Easier to understand codebase

### Previous Version: 0.5.2 (November 9, 2025)

-   🔧 **Internal Improvements:**
    -   Refactored wildcard parameter extraction logic into reusable utility
        functions
    -   Added test suites and README files for all example projects

### Previous Version: 0.5.0 (November 1, 2025)

-   🌟 **Feature:** Auto-injected OPTIONS handler for CORS preflight:

    -   Automatically injects an OPTIONS handler for CORS preflight when needed
    -   Only injects if the route defines any preflight-triggering methods and
        lacks an OPTIONS handler
    -   Injects a minimal OPTIONS handler that returns a 204 No Content response
    -   Works for all HTTP methods that trigger CORS preflight (POST, PUT,
        DELETE, PATCH)
    -   Does not inject if the route already has an OPTIONS handler

-   🌟 **Feature:** Improved response handling in middleware (after
    middlewares):

    -   After middlewares now run even if the current middleware already
        returned a response
    -   After middlewares run in reverse order to make changing the response
        easier and to help with CORS

-   🐛 **Bug Fix:** Fixed TypeScript type resolution for package consumers:
    -   Users now get full IntelliSense, autocomplete, and type safety out of
        the box

### Previous Version: 0.4.0 (October 21, 2025)

-   🌟 **Feature:** Wildcard Routes:
    -   Added wildcard routes using `[...]` folder name - matches any path after
        it
    -   Create routes that handle multiple path segments automatically
    -   Access all matched path parts through `wildcardParams` in your request
    -   Routes are matched in order: exact paths first, then dynamic routes
        (like `[id]`), then wildcards last
    -   Works inside dynamic routes too (example: `/api/users/[userId]/[...]`)
    -   View wildcard routes in OpenAPI docs and Swagger UI

### Previous Version: 0.3.0 (August 15, 2025)

-   🌟 **Feature:** Updated Zod to version 4:
    -   Updated Zod version from 3.x to 4.x
    -   Updated built-in request validation middleware to use Zod 4
    -   Updated and better request validation middleware error handling
    -   Removed Zod-to-json-schema dependency and use Zod 4 directly

For a complete list of changes, please check the [Changelog](./packages/burger-api/CHANGELOG.md) file.

## 🎯 What's Coming Next?

We're actively enhancing burger-api with powerful new features Stay tuned for
updates as we continue to build and improve burger-api! We're committed to
making it the best API framework for Bun.js.

## 🤝 Contributing

We welcome contributions from the community! If you have suggestions or
improvements, please open an issue or submit a pull request. Let's build
something amazing together.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./packages/burger-api/LICENSE) file
for details.

The MIT License is a permissive license that is short and to the point. It lets
people do anything they want with your code as long as they provide attribution
back to you and don't hold you liable.
