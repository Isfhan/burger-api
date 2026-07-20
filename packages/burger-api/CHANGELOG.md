## 📣 Release Notes - Burger API Framework

### Version 0.14.0 (Compiler-Driven Core, Request Context & Validation 2.0)

Released 2026-07-21. This release is the architecture reset: BurgerAPI now
compiles your file tree into an immutable, fully-compiled application. The
compiler is the single place that understands your routes. Backward
compatibility is not a goal (pre-1.0.0 reset).

**Compiler-driven core**
- Compiler pipeline: `Directory Scanner → Module Loader → RouteModule →
  Compiler → CompiledRoute`. The `RouteModule` is the canonical internal
  representation of one route directory; `CompiledRoute` is the immutable
  runtime artifact.
- Directory Scanner: a pure filesystem walk that inventories convention files
  (`route.ts`, `schema.ts`, `hooks.ts`, `use.ts`, `openapi.ts`, `webhook.ts`)
  without importing any module. Rejects `middleware.ts` (the v2 architecture
  has no middleware concept).
- Module Loader: imports convention files, merges group inheritance
  (nearest-last, deterministic), overlays inline `route.ts` exports, and fails
  fast on duplicate route paths. Auto-injects `OPTIONS` for preflight methods.
- Runtime adapter seam: the framework body speaks only Web Standard
  `Request`/`Response`; `BunAdapter` is the single runtime-specific surface
  (`Bun.serve` + native `routes` map). Static routes dispatch in O(1); dynamic
  and wildcard routes use Bun's native `routes` map with a trie fallback.
- Native `:param` / `*` dispatch: dynamic and wildcard routes are registered
  directly on Bun's native `routes` map, so they dispatch without the `fetch`
  fallback hop. Param extraction uses only `Request.url` and is WinterCG-safe.

**Request lifecycle (middleware pipeline)**
- The request lifecycle runs through a single middleware pipeline:
  `globalMiddleware` (from `ServerOptions`) followed by a route's `middleware`
  array. A middleware can stop the request early by returning a `Response`,
  transform the response by returning a function, or continue by returning
  `undefined`. Validation, `405`/`Allow`, auto-`HEAD`, and loose trailing-slash
  are compiled into the runtime.
- `hooks.ts`, `use.ts`, and `webhook.ts` are discovered and carried through the
  compiler but are reserved (not yet executed at runtime).

**Request context (BurgerContext)**
- `BurgerContext`: a single, prototype-based request object allocated once per
  request. It lazily exposes `query`, `params`, `route`, `headers`, `validated`,
  `set` and transparently delegates the standard `Request` surface. The shared,
  stable prototype gives every request the same object structure, which the
  JavaScript engine can optimize well.
- `parseQuery`: a fast, Bun-native querystring parser that replaces the
  per-request `new URL(req.url)`. It matches `URLSearchParams` parity (including
  `+` to space and malformed-escape leniency).
- `req.route`: `{ path, pattern }` is available on every matched route,
  including static routes served through Bun's native routing.
- `req.set`: a response-mutation surface (`status` + `headers`) merged into the
  outgoing `Response` by `applySet` at the single exit point of the request
  flow. `applySet` is a no-op (zero allocation) when no mutation is set.
- Dead-path elimination: lazy getters mean a field a route never reads is never
  parsed and never allocated.

**Validation 2.0**
- Compiled validators: each route schema is prepared once at startup and reused
  on every request. Identical schemas across routes share one compiled
  validator, so startup cost scales with the number of unique shapes, not the
  number of routes.
- Validator cache: compiled validators are cached by a structural key, so the
  same schema object (or model reference) is never compiled twice.
- Model registry: define a shape once in `ServerOptions.models` and reference it
  by name (`"Pagination"`) from any route's `schema` slot.
- Standard Schema support: any library that follows the Standard Schema
  contract (Zod v4, Valibot, ArkType) works through the same `schema` export.
  Zod remains the default.
- Automatic type conversion (coercion): set `validation.coerce: true` (app-wide)
  or `coerce: true` on a route to turn `"42"` into `42` and `"true"` into
  `true` for query, params, headers, and cookies. Off by default.
- Response validation: declare a `response` schema and BurgerAPI checks what
  your handler returns. `validation.responseValidation` is `off` (default),
  `dev` (observe, never break), or `enforce` (returns a safe error on
  mismatch).
- Headers and cookie validation: validate request headers and cookie values
  with `headers` / `cookie` slots on the route `schema`, attached to
  `req.validated.headers` / `req.validated.cookie`.
- Problem Details support: choose the error format with
  `validation.errorFormat`: `plain` (simple JSON) or `problem+json` (RFC 9457).
  Production error bodies never leak stacks or schema internals.

**Migration:** None required. Every change is strictly additive. Existing
`route.ts` files and the `GET(req: BurgerRequest)` signature are unchanged;
the entire `examples/` suite passes unchanged.

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
