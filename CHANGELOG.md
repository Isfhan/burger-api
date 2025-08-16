## 📣 Release Notes

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
