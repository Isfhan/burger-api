## 📣 Release Notes - Burger API Framework

### Version 0.11.0 (Phase 2 — Request Context & Dead-Path Elimination)

- 🍔 **`BurgerContext`** — a single, prototype-based request object allocated
  **once per request**. Lazily exposes `query`, `params`, `route`, `headers`,
  `validated`, `set` and transparently delegates the standard `Request` surface.
  Shared, stable prototype → monomorphic hidden class (JIT-friendly).
- ⚡ **`parseQuery`** — a fast, Bun-native querystring parser replacing the
  per-request `new URL(req.url)` in the validator. Matches `URLSearchParams`
  parity (incl. `+`→space, malformed-escape leniency). ~1.7× faster than the
  previous `new URL` + `URLSearchParams` path.
- 🎯 **`req.route`** — `{ path, pattern }` now available on **every** matched
  route, including static routes served through Bun's native routing.
- 🔧 **`req.set`** — response-mutation surface (`status` + `headers`), merged
  into the outgoing `Response` by `applySet` at the single pipeline exit.
  `applySet` is a no-op (zero allocation) when no mutation is set, and runs
  uniformly on GET **and** auto-HEAD responses.
- 🧠 **`RouteAccessAnalyzer`** (optional) — compile-time, self-contained static
  analysis of which context fields a route reads, producing a frozen
  `RouteAccessInfo` hint. Conservative: `debug`, ambiguous, or failed analysis
  yields the safe "all fields used" default. **Never** affects runtime correctness.
- 🪝 **Dead-path elimination** — provided structurally by the lazy getters; a
  field a route never reads is never parsed and never allocated.
- 🧊 **Frozen getters** — the shared prototype's getters are frozen so they
  cannot be replaced across requests; delegation methods stay writable so the
  existing `req.json` reassignment and middleware custom properties keep working.

**Migration:** None required. All changes are strictly additive and optional
(`query`, `set`, `route` are new optional `BurgerRequest` fields). Existing
`route.ts` files and the `GET(req: BurgerRequest)` signature are unchanged; the
entire `examples/` suite passes unchanged.

### Version 0.9.7 (May 16, 2026)

-   **CLI (published with this tag)** – Reliability and DX fixes: GitHub HTTP
    timeouts no longer keep the process alive after work finishes; clearer
    subprocess and entry handling; small contributor note in the CLI README.

### Version 0.9.6 (March 18, 2026)

-   🚀 **Production builds** – `build` and `build:exec` work better and are more
    reliable.
-   🎯 **Same rules everywhere** – Same route and path rules in development and
    production builds.
-   📦 **No file scanning in production** – You can pass in route lists when
    starting the server so production does not need to scan files.
-   🧪 **Example tests** – A shared helper starts and stops the server safely.
-   📋 **Test scripts** – Run framework and CLI tests from the repo root.

### Version 0.7.0 (December 24, 2025)

-   🔧 **CLI & Release Improvements:**
    -   Added CLI tool for creating new projects and managing middleware
    -   Updated README.md


### Version 0.6.3 (December 17, 2025)

-   🔧 **CLI & Release Improvements:**
    -   Added GitHub Actions release workflow for CLI executables
    -   Updated README.md


### Version 0.6.2 (November 13, 2025)

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

### Version 0.5.2 (November 9, 2025)

-   🔧 **Internal Improvements:**
    -   Refactored wildcard parameter extraction logic into reusable utility
        functions
    -   Added test suites and README files for all example projects

### Version 0.5.0 (November 1, 2025)

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
    -   Improved build process by removing `tsc-alias` dependency
    -   Converted `src/types/index.d.ts` to `src/types/index.ts` for proper
        emission
    -   Updated all 49 files across `src/` and `examples/` folders
    -   Build is now faster and more reliable
    -   Universal compatibility across Bun

### Version 0.4.0 (October 21, 2025)

-   🎯 **Wildcard Routes:**
    -   Added wildcard routes using `[...]` folder name - matches any path after
        it
    -   Create routes that handle multiple path segments automatically
    -   Access all matched path parts through `wildcardParams` in your request
    -   Routes are matched in order: exact paths first, then dynamic routes
        (like `[id]`), then wildcards last
    -   Works inside dynamic routes too (example: `/api/users/[userId]/[...]`)
    -   View wildcard routes in OpenAPI docs and Swagger UI
    -   Added easy-to-follow examples showing different ways to use wildcard
        routes

### Version 0.3.0 (August 15, 2025)

-   🔧 **Updated Zod to version 4:**
    -   Updated Zod version from 3.x to 4.x
    -   Updated built-in request validation middleware to use Zod 4
    -   Updated and better request validation middleware error handling
    -   Removed Zod-to-json-schema dependency and use Zod 4 directly

### Version 0.2.3 (May 2, 2025)

-   ⚡ **Core Improvements:**

    -   Removed custom request/response classes for simpler API
    -   Enhanced type safety and error handling

### Version 0.2.0 (April 26, 2025)

-   ⚡ **Performance & Core Improvements:**
    -   Optimized framework core and improved middleware handling
    -   Enhanced OpenAPI documentation and route tracking
    -   Updated ID preprocessing logic in schema validation
    -   Improved type definitions across the framework

### Version 0.1.5 (April 2, 2025)

-   🔧 **Dependencies & Build:**

    -   Updated dependencies to latest versions
    -   Enhanced build process with tsc-alias
    -   Improved TypeScript configuration

-   📦 **Package Updates:**

    -   Updated zod to version ^3.24.2
    -   Updated zod-to-json-schema to version ^3.24.5
    -   Updated TypeScript peer dependency to ^5.7.3

-   ⚡ **Performance & Core Improvements:**
    -   Enhanced request handling and middleware execution in Burger class
    -   Implemented trie structure for optimized route management
    -   Improved route collection and validation in ApiRouter
    -   Enhanced OpenAPI integration with better route handling

### Version 0.1.4 (March 23, 2025)

-   🎨 **Code Quality & Standards:**

    -   Added Prettier configuration for consistent code style
    -   Enhanced code formatting and structure across the codebase
    -   Improved type definitions and safety
    -   Enhanced error handling and response formatting

-   🔄 **Refactoring and Improvements:**
    -   Enhanced page routing and server response handling
    -   Improved import paths configuration
    -   Updated request/response handling
    -   Enhanced server initialization process

### Version 0.1.1 (March 15, 2025)

-   🔧 **Middleware Improvements:**
    -   Updated middleware to use BurgerNext type for next function
    -   Enhanced type safety in middleware chain

### Version 0.1.0 (March 10, 2025)

-   🎨 **Static Page Serving:**
    -   Basic support for serving static `.html` files
    -   File-based routing for pages
    -   Support for route grouping with `(group)` syntax
    -   Support for dynamic route with `[slug]` syntax

### Version 0.0.39 (February 25, 2025)

-   🚀 Initial release with core API features
-   ⚡ Bun-native HTTP server implementation
-   📁 File-based API routing
-   ✅ Zod schema validation
-   📚 OpenAPI/Swagger integration
-   🔄 Middleware system
