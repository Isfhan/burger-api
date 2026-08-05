<p align="center">
  <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342" alt="BurgerAPI logo"/>
</p>

<p align="center">
  <strong>A modern, high-performance API framework built on Bun.js</strong>
</p>

<p align="center">
  <a href="https://github.com/isfhan/burger-api">
    <img src="https://img.shields.io/badge/version-1.0.0-green.svg" alt="Version 1.0.0" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  </a>
  <a href="https://bun.sh">
    <img src="https://img.shields.io/badge/Bun-1.3.0%2B-black?logo=bun" alt="Bun" />
  </a>
  <a href="https://burger-api.com">
    <img src="https://img.shields.io/badge/docs-burger--api.com-green.svg" alt="Documentation" />
  </a>
</p>

## 📖 About

This monorepo contains **BurgerAPI**: a Bun-first, WinterCG-compatible API
framework with file-based routing, a **hook-based** request lifecycle, Standard
Schema validation (Zod default), plugins/providers, and OpenAPI. TypeScript and
JavaScript are both first-class.

**Architecture source of truth:** [`../BURGERAPI_VISION.md`](../BURGERAPI_VISION.md)  
When docs or code disagree with the vision, **the vision wins**.

**Hooks** control the request lifecycle. **Plugins** extend the application.
They are separate concepts.

**📌 Releases:**
- **burger-api** 1.0.0
- **@burger-api/cli** 1.0.0

## 📦 Packages

This monorepo is organized into the following packages:

### 🚀 [`packages/burger-api`](./packages/burger-api)

The core **burger-api** framework package. This is the main framework that gets
published to npm.

#### ✨ Key Features

-   ⚡ **Bun-Native Hybrid Routing** - Static routes are served by Bun's native
    `routes` map (the fast path), while `:param` and `*` routes are served by
    BurgerAPI's optimized internal trie (a tree structure for fast path
    matching). Both share one request flow (also called a pipeline).
-   📁 **File-Based Routing** - Automatically registers API routes from your
    file structure, including dynamic `[id]` parameters and `[...slug]`
    wildcards
-   🪝 **Hook lifecycle** - `onRequest`, `transform`, `beforeRoute`, `afterRoute`,
     `mapResponse`, `onError`; global hooks in `src/hooks.ts`, route hooks in
     `api/**/hooks.ts`
-   ✅ **Type-Safe Validation** - Optional `schema.ts` with per-method exports;
     Standard Schema (Zod default); `ctx.validated`; RFC 9457 errors (throw
     `ValidationError` → 422 via `onError`)
-   📚 **Automatic OpenAPI Generation** - OpenAPI 3.0 + docs UI
-   🔌 **Plugins & providers** - `src/plugins.ts` / `src/providers.ts`
-   🎯 **Route convention files** - `route.ts`, `schema.ts`, `hooks.ts`,
     `openapi.ts`, `config.ts` (self-contained routes, no group inheritance)
-   🔀 **Automatic HEAD** - `HEAD` requests are derived from `GET` automatically
    (same handler, body stripped)
-   ❌ **Proper 405 Responses** - a known route requested with an unsupported
    method returns `405` with an `Allow` header listing the supported methods
-   🔗 **Loose Trailing Slash** - `/foo` and `/foo/` match the same route
-   🌍 **WinterCG deploy surface** - `app.serve(port)` on Bun;
    `toFetchHandler(app)` for Cloudflare Workers, Vercel, Deno Deploy, Node 24+
-   🟨 **JavaScript first-class** - same conventions in `.ts` / `.js` / `.mjs`

### 🛠️ [`packages/cli`](./packages/cli)

The **Burger API CLI** tool for scaffolding new burger-api projects and managing
your development workflow.

#### ✨ Key Features

-   🚀 **Project Scaffolding** - Create new burger-api projects with interactive
    prompts (`--lang ts|js`, `--defaults`)
-   🔌 **Ecosystem Management** - Browse and add hooks and plugins from the
    ecosystem
-   🔨 **Build Tools** - Bundle projects (AOT routes) or compile to standalone
    executables
-   🔥 **Development Server** - Hot reload development server with auto-restart
-   🎯 **Zero Dependencies** - Uses Bun's native APIs for file operations and
    downloads
-   💻 **Cross-Platform** - Works on Windows, macOS, and Linux

#### 📥 Installation

**Option 1: Bun Global Installation (Recommended if you have Bun installed)**

```bash
# Global installation
bun add -g @burger-api/cli

# Or use with bunx (No Installation Needed)
bunx @burger-api/cli create my-project
```

**Option 2: Standalone Executable**

**macOS, Linux, WSL:**
```bash
curl -fsSL https://burger-api.com/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://burger-api.com/install.ps1 | iex
```

Or download the executable from [GitHub Releases](https://github.com/isfhan/burger-api/releases/latest).

**Package Details:**
- **NPM Package:** [`@burger-api/cli`](https://www.npmjs.com/package/@burger-api/cli)
- **Requires:** Bun >=1.3.0

For detailed documentation, see
[`packages/cli/README.md`](./packages/cli/README.md).

## 🚀 Quick Start

### Prerequisites

-   [Bun](https://bun.sh) installed (version 1.3.0 or later)

### Installation

Install dependencies for all packages:

```bash
bun install
```

### Development

#### Work on Individual Packages

```bash
# Work on burger-api framework
cd packages/burger-api

# Work on CLI
cd packages/cli
```

#### Use Workspace Commands from Root

```bash
# Typecheck burger-api
bun run typecheck

# Build burger-api
bun run build

# Full suite: route-sync + framework (examples + ecosystem smoke) + CLI + typecheck
bun run test:all

# Framework package only (examples + ecosystem smoke tests)
bun run test:framework

# CLI tests only
bun run test:cli

# Run burger-api dev server
bun run dev
```

## 🔨 Production Builds

BurgerAPI has two production build modes using the CLI:

### 1) Bundle mode

```bash
burger-api build src/index.ts
```

- Default output: `.build/bundle/app.js`
- Run with Bun:

```bash
bun .build/bundle/app.js
```

### 2) Standalone executable mode

```bash
burger-api build:exec src/index.ts
```

- Default output:
  - Windows: `.build/executable/<project>.exe`
  - Linux/macOS: `.build/executable/<project>`
- No Bun install required on the target machine.

### Useful options

- `--outfile <path>` custom output path
- `--target <platform>` cross-compile executable target
- `--minify` minified output
- `--sourcemap <type>` (`inline`, `linked`, `none`) for bundle mode
- `--no-bytecode` disable bytecode in executable mode

## ⚙️ AOT Routing (How builds work)

BurgerAPI uses file-based routing. In development, routes are discovered by
scanning files when the server starts. In production builds, routes are
discovered when the app is built — prepared ahead of time (AOT) — so no scanning
is needed while the server is running.

Build flow:

1. CLI scans route/page directories.
2. CLI generates a temporary entry file with static imports.
3. Bun bundles the app and embedded route metadata.
4. Runtime uses embedded routes directly.

This keeps production startup reliable in bundled and executable outputs.

## 🛣️ Routing

BurgerAPI maps your file structure to routes automatically.

| Pattern        | File                              | URL match            |
| -------------- | --------------------------------- | -------------------- |
| Static         | `src/api/health/route.ts`         | `/api/health`        |
| Parameter      | `src/api/users/[id]/route.ts`     | `/api/users/123`     |
| Wildcard       | `src/api/files/[...]/route.ts`    | `/api/files/a/b/c`   |

-   **Static routes** are matched exactly and dispatched by Bun's native
    `routes` map (O(1)).
-   **Parameter routes** (`[id]`) capture a single path segment into
    `ctx.params.id`.
-   **Wildcard routes** (`[...]`) capture the remaining segments into
    `ctx.wildcardParams` (an array). A wildcard route also matches its own base
    path — `/api/files/[...]` matches both `/api/files/a/b/c` and `/api/files`.
-   **Trailing slash** is loose by default: `/api/health` and `/api/health/`
    resolve to the same route. A trailing slash on a parameter route is treated
    as an empty parameter value (e.g. `/api/users/` → `ctx.params.id === ""`).
-   **HEAD** is automatic: a `HEAD` request to a route that defines `GET` runs
    the `GET` handler and returns the response with the body removed.
-   **405** is correct: requesting a known route with an unsupported method
    returns `405` with an `Allow` header (e.g. `Allow: GET, POST`).

## ⚡ Performance

-   **Static routes** use Bun-native routing — the fastest dispatch path, with
    no framework code in the code that runs on every request (the hot path).
-   **Dynamic routes** use BurgerAPI's optimized internal trie (a tree structure
    for fast path matching), matched in `O(number of path segments)`.
-   **Shared prepared handlers** run the same hook lifecycle for static and
    dynamic routes, so behavior (and optimizations) never drift between them.
-   **Bun-first architecture**: Bun is the primary runtime, with a WinterCG
    adapter (`toFetchHandler`) for non-Bun targets.

## 🏗️ Architecture

```
        Request
           │
           ▼
   ┌───────────────────┐
   │  Static path?      │
   └───────────────────┘
        │          │
       yes         no
        │          │
        ▼          ▼
  ┌──────────┐  ┌──────────────────────────────┐
  │ Bun      │  │ Router.fetch (fallback)        │
  │ routes   │  │   │                            │
  │ map      │  │   ▼                            │
  └──────────┘  │  Internal trie (:param, *)     │
                └───────────────┬────────────────┘
                                │
                                 ▼
                  Shared request flow (hooks → handler)
```

Static routes are dispatched directly by Bun; dynamic and wildcard routes are
dispatched by the internal trie via a single `fetch` fallback. Both paths run
the **same prepared handler**, so method dispatch, `405`/`Allow`, auto-`HEAD`,
and hook behavior are identical regardless of how the route was matched.

## 🧭 Routing/Build Ownership (Contributor Guide)

If you want to contribute, this split helps:

- Framework route behavior:
  - `packages/burger-api/src/compiler/` (scanner, module-loader, conventions)
  - `packages/burger-api/src/router/` (Hybrid Router: `compiler`, `trie`,
    `static-map`, `allow-cache`, `router`)
  - `packages/burger-api/src/utils/pathConversion.ts`
- CLI build scanning and generation:
  - `packages/cli/src/utils/scanner.ts`
  - `packages/cli/src/utils/virtual-entry.ts`
  - `packages/cli/src/utils/build/pipeline.ts`
  - `packages/cli/src/utils/build/bun.ts`
  - `packages/cli/src/utils/build/entry.ts`

When changing route or path conversion logic in either the framework or the CLI, run `bun run test:route-sync` from the repo root and update the other implementation if the test fails.

## 📚 Documentation

-   **Framework Documentation:**
    [`packages/burger-api/README.md`](./packages/burger-api/README.md)
-   **Official Website:** [burger-api.com](https://burger-api.com/)
-   **Publishing Guide:**
    [`packages/burger-api/PUBLISHING.md`](./packages/burger-api/PUBLISHING.md)

## 🏗️ Project Structure

```
burger-api/
├── packages/
│   ├── burger-api/          # Core framework (published to npm)
│   │   ├── src/             # Source code
│   │   ├── examples/        # Example projects
│   │   └── dist/            # Build output
│   └── cli/                 # CLI tool (published to npm)
│       └── src/             # CLI source code
├── ecosystem/               # Official hooks + plugins (ready-to-use)
├── package.json             # Workspace root configuration
└── README.md                # This file
```

## 🤝 Contributing

We welcome contributions from the community! Whether it's:

-   🐛 Reporting bugs
-   💡 Suggesting features
-   📝 Improving documentation
-   🔧 Submitting pull requests

Please feel free to open an issue or submit a pull request. Let's build
something amazing together!

**Contributing Guidelines:**

-   Check existing issues before creating new ones
-   Follow the existing code style
-   Add tests for new features
-   Update documentation as needed

## 📄 License

This project is licensed under the **MIT License** - see the
[LICENSE](./packages/burger-api/LICENSE) file for details.

The MIT License is a permissive license that allows people to do anything with
your code as long as they provide attribution back to you and don't hold you
liable.

## 🔗 Links

-   **Website:** [burger-api.com](https://burger-api.com/)
-   **GitHub:**
    [github.com/isfhan/burger-api](https://github.com/isfhan/burger-api)
-   **Issues:**
    [github.com/isfhan/burger-api/issues](https://github.com/isfhan/burger-api/issues)
-   **Bun.js:** [bun.sh](https://bun.sh)

---

<p align="center">
  Made with ❤️ for the Bun.js community by <a href="https://github.com/isfhan">Isfhan Ahmed</a>
</p>
