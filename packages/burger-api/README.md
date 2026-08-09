<div align="center">
 <a href="https://burger-api.com">
 <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342" alt="BurgerAPI"/>
 </a>
</div>

[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/isfhan/burger-api/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./packages/burger-api/LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.3.0%2B-black?logo=bun)](https://bun.sh)

**burger-api** is a Bun-first, WinterCG-compatible API framework with
file-based routing, a hook-based request lifecycle, Standard Schema validation
(Zod default), plugins/providers, and automatic OpenAPI generation. It runs on
Bun in development and production, and deploys to any WinterCG runtime
(Cloudflare Workers, Vercel, Deno Deploy, Node 24+) through `toFetchHandler`.

**Hooks** control the request lifecycle. **Plugins** extend the application.
They are separate concepts.

## 📚 Table of Contents

- [Overview](#-overview)
- [CLI Tool](#-cli-tool)
- [Changelog](#-changelog)
- [Contributing](#-contributing)
- [License](#-license)

## 📖 Documentation

For detailed documentation and examples, visit the
[BurgerAPI official docs](https://burger-api.com/).

## 🚀 Overview

burger-api is built to offer a robust developer experience through:

- ⚡ **Bun-Native Performance:**
 Leverages Bun's high-performance HTTP server, with AOT route compilation for
 production bundles (`burger-api build`).

- 📁 **File-Based Routing:**
 Automatically registers API routes from your file structure using clear
 convention files: `route.ts`, `schema.ts`, `hooks.ts`, `openapi.ts`,
 `config.ts` (`.js`/`.mjs` work the same — JS is first-class). No group or
 folder inheritance: every route directory stands on its own.

- 🔄 **Hook lifecycle:**
 `onRequest` → `transform` → validation → `beforeRoute` → handler →
 `afterRoute` → `mapResponse` (`onError` on failure). Global hooks live in
 `src/hooks.ts`; route hooks in `api/**/hooks.ts`. Public context type:
 **`BurgerContext`** — typed, validated, and passed to every hook and handler.

- ✅ **Type-Safe Validation:**
 Schemas for query, params, headers, cookies, and body are validated before
 your handler runs and exposed as typed `ctx.validated`. Reuse shapes through
 a model registry, enable automatic type conversion, validate responses, and
 support any Standard Schema library (Zod v4, Valibot, ArkType). Errors follow
 the RFC 9457 Problem Details format.

- 📚 **Automatic OpenAPI Generation:**
 Generates a complete OpenAPI 3.0 specification directly from your routes and
 Zod schemas.

- 🔍 **Docs UI Integration:**
 Out-of-the-box interactive API documentation (Swagger UI default, Scalar and
 Redoc built in, or any custom `DocsProvider`).

- 🌍 **WinterCG Deploy Surface:**
 `app.serve(port)` for Bun; `toFetchHandler(app)` returns
 `(request, ...env) => Promise<Response>` for Cloudflare Workers, Vercel, Deno
 Deploy, and Node 24+ — HTTP-only, no filesystem scanning, no Bun imports.

## 🛠️ CLI Tool

burger-api comes with a powerful CLI (`@burger-api/cli`) that scaffolds
projects, runs a dev server, builds AOT production bundles, and manages
ecosystem hooks and plugins. Install it globally to get started:

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

- **npm package:**
 [`@burger-api/cli`](https://www.npmjs.com/package/@burger-api/cli)
- **Requires:** Bun >=1.3.0

### Quick Start

```bash
# Create a new burger-api project (add --lang js for JavaScript)
burger-api create my-api

# Navigate to your project
cd my-api

# Start development server
bun run dev
```

### Installing Ecosystem Hooks and Plugins

The CLI makes it easy to add official hooks and plugins to your project:

```bash
# List all available hooks and plugins
burger-api list

# Add hooks to your project
burger-api add cors logger rate-limiter

# Add plugins (auth, sessions, env, ...)
burger-api add jwt-auth
```

**Popular Hook Factories Available:**

- **`cors`** - Cross-Origin Resource Sharing
- **`logger`** - Request/response logging
- **`rate-limiter`** - Request rate limiting
- **`cache`** - HTTP caching headers
- **`compression`** - Response compression (gzip/deflate)
- **`security-headers`** - Security HTTP headers
- **`timeout`** - Request timeout
- **`body-size-limiter`** - Request body size limits

**Plugins Available:**

- **`jwt-auth`** / **`api-key`** / **`basic-auth`** - Authentication
- **`session`** - Session management
- **`env`** - Environment configuration
- **`oidc`** - OpenID Connect

After adding hooks or plugins, the CLI shows you exactly how to wire them into
your `src/hooks.ts` and `src/plugins.ts`. For more information, visit the
[CLI documentation](../../packages/cli/README.md).

## 📣 Changelog

### Latest Version: 1.0.0

- 🚀 **1.0 stable.** Vision-locked architecture: `BurgerContext`, the six
 hook points (`onRequest`, `transform`, `beforeRoute`, `afterRoute`,
 `mapResponse`, `onError`), plugins/providers, and WinterCG deploy surface
 (`toFetchHandler`).
- 🗑️ **Removed legacy API:** `BurgerRequest`, `beforeHandle`/`afterHandle`/
 `onResponse`/`provide`, the middleware system, `Burger.use`, group/folder
 inheritance, `use.ts`/`webhook.ts`, CLI `serve`, and auth hooks (now plugins).
- 🟨 **JavaScript is first-class:** `.ts`/`.js`/`.mjs` conventions, `create
 --lang js`, JSDoc types, lang-aware `generate`.
- 🔌 **Ecosystem:** official hooks and plugins installable via `burger-api add`.

For previous versions, see the [Changelog](./packages/burger-api/CHANGELOG.md).

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
