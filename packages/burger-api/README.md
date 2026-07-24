<div align="center">
  <a href="https://burger-api.com">
    <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342"  alt="BurgerAPI"/>
  </a>
</div>

[![Under Development](https://img.shields.io/badge/under%20development-red.svg)](https://github.com/isfhan/burger-api)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./packages/burger-api/LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.3.0%2B-black?logo=bun)](https://bun.sh)
[![Version](https://img.shields.io/badge/version-0.14.0-green.svg)](https://github.com/isfhan/burger-api/releases)

**burger-api** is a Bun-first, WinterCG-compatible TypeScript API framework with
file-based routing, a hook-based request lifecycle, Standard Schema validation
(Zod default), plugins/providers, and OpenAPI generation.

**Architecture source of truth:** `../../burger-api-roadmaps/BURGERAPI_VISION.md`  
When this README and the vision disagree, **the vision wins**.

**Hooks** control the request lifecycle. **Plugins** extend the application.
They are separate concepts.

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

-   🔄 **Hook lifecycle (target):**  
    `onRequest` → `transform` → validation → `beforeRoute` → handler →
    `afterRoute` → `mapResponse` (`onError` on failure). Global hooks live in
    `src/hooks.ts`; route hooks in `api/**/hooks.ts`. Route convention files:
    `route.ts`, `schema.ts`, `hooks.ts`, `openapi.ts`, `config.ts` (no group
    inheritance). Public context type: **`BurgerContext`**.

-   🔄 **Legacy note:**  
    The currently published package may still expose older names
    (`BurgerRequest`, `beforeHandle`, group inheritance). Prefer the vision API
    for new docs and features. Historical pipeline detail:

    -   `Response` - Stop here, send this response
    -   `Function` - Transform the final response after handler runs
    -   `undefined` - Continue to the next hook or handler

-   ✅ **Type-Safe Validation:**  
    Schemas for query, params, headers, cookies, and body are validated before
    your handler runs and exposed as typed `req.validated`. Reuse shapes through
    a model registry, enable automatic type conversion, validate responses, and
    support any Standard Schema library (Zod v4, Valibot, ArkType). Errors follow
    the RFC 9457 Problem Details format.

-   📚 **Automatic OpenAPI Generation:**  
    Generates a complete OpenAPI 3.0 specification directly from your routes and
    Zod schemas.

-   🔍 **Swagger UI Integration:**  
    Out-of-the-box Swagger UI endpoint for interactive API documentation.

## 🛠️ CLI Tool (Newly Added)

burger-api comes with a powerful CLI tool that makes it easy to scaffold new
projects and manage middleware. Install it globally to get started:

### Installation

**Option 1: Bun Global Installation (Recommended if you have Bun installed)**

````bash
# Global installation
bun add -g @burger-api/cli
````
**Or use with bunx (No Installation Needed):**

````bash
bunx @burger-api/cli create my-project
````

**Option 2: Standalone Executable (Alternative Installation Method)**

**macOS, Linux, WSL:**

```bash
curl -fsSL https://burger-api.com/install.sh | bash
```

**Windows PowerShell:**

```powershell
irm https://burger-api.com/install.ps1 | iex
```

**Option 3: Manual Download (Alternative Installation Method)**

1. Download the executable for your platform from
   [GitHub Releases](https://github.com/isfhan/burger-api/releases/latest)
2. Add to PATH
3. Make executable (Linux/macOS): `chmod +x burger-api`

**Verify Installation (To Check if the CLI is Installed Correctly)**

```bash
burger-api --version
```

**Package Details:**

-   **npm package:**
    [`@burger-api/cli`](https://www.npmjs.com/package/@burger-api/cli)
-   **Requires:** Bun >=1.3.0

### Quick Start

```bash
# Create a new burger-api project
burger-api create my-api

# Navigate to your project
cd my-api

# Start development server
bun run dev
```

### Installing Ecosystem Hooks

The CLI makes it easy to add production-ready hooks (CORS, JWT auth, rate limiting,
etc.) to your project. These are hook factories you wire into your `api/hooks.ts`:

```bash
# List all available hooks
burger-api list

# Add hooks to your project
burger-api add cors logger rate-limiter
```

**Popular Hook Factories Available:**

-   **`cors`** - Cross-Origin Resource Sharing for handling cross-origin
    requests
-   **`logger`** - Request/response logging with detailed information
-   **`rate-limiter`** - Request rate limiting to prevent API abuse
-   **`jwt-auth`** - JWT authentication for securing your API endpoints
-   **`api-key-auth`** - API key authentication for server-to-server
    communication
-   **`compression`** - Response compression (gzip/deflate) to reduce bandwidth
-   **`security-headers`** - Security HTTP headers to protect against common
    attacks
-   **`cache`** - HTTP caching headers for improved performance
-   **`timeout`** - Request timeout to prevent long-running requests
-   **`body-size-limiter`** - Request body size limits to prevent large payload
    attacks

After installing middleware, the CLI will show you exactly how to use it in your
project. For more information, visit the
[CLI documentation](../../packages/cli/README.md).

## 📣 Changelog

### Latest Version: 0.14.0 (July 21, 2026)

-   🚀 Production builds work better and use the same route rules as
    development.
-   📦 You can pass route lists into the server so production does not scan
    files.
-   🧪 Example tests and test scripts are improved; run framework and CLI
    tests from the repo root.

### Previous Version: 0.7.0 (November 13, 2025)

-   ⚡ **Major Performance Improvements:**

    -   middleware runs through specialized fast paths
    -   middleware lists are prepared ahead of time (pre-computed arrays)
    -   fewer memory allocations at request time (arrays are allocated once)
    -   a direct code path for the common 2-middleware case
    -   smaller code: reduced from ~110 to ~80 lines

-   🎯 **Simplified Middleware System:**

    -   Clearer return types: Response, Function, or undefined
    -   Removed the complex "around" middleware pattern
    -   Dedicated fast paths for 0, 1, and 2 middlewares
    -   Better runtime optimization by the JavaScript engine

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

For a complete list of changes, please check the
[Changelog](./packages/burger-api/CHANGELOG.md) file.

## 🎯 What's Coming Next?

We're actively enhancing burger-api with powerful new features Stay tuned for
updates as we continue to build and improve burger-api! We're committed to
making it the best API framework for Bun.js.

## 🤝 Contributing

We welcome contributions from the community! If you have suggestions or
improvements, please open an issue or submit a pull request. Let's build
something amazing together.

## 📄 License

This project is licensed under the MIT License - see the
[LICENSE](./packages/burger-api/LICENSE) file for details.

The MIT License is a permissive license that is short and to the point. It lets
people do anything they want with your code as long as they provide attribution
back to you and don't hold you liable.
