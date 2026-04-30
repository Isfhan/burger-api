<p align="center">
  <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342" alt="BurgerAPI logo"/>
</p>

<p align="center">
  <strong>A modern, high-performance API framework built on Bun.js</strong>
</p>

<p align="center">
  <a href="https://github.com/isfhan/burger-api">
    <img src="https://img.shields.io/badge/under%20development-red.svg" alt="Under Development" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  </a>
  <a href="https://bun.sh">
    <img src="https://img.shields.io/badge/Bun-1.2.20-black?logo=bun" alt="Bun" />
  </a>
  <a href="https://burger-api.com">
    <img src="https://img.shields.io/badge/docs-burger--api.com-green.svg" alt="Documentation" />
  </a>
</p>

## 📖 About

This monorepo contains the **burger-api** ecosystem - a modern, open-source API
framework built on [Bun.js](https://bun.sh). The framework combines the
simplicity of file-based routing with powerful features like built-in
middleware, Zod-based schema validation, and automatic OpenAPI generation.

**This project is under active development and should not be used in production
yet.** 📌 Latest release: **0.9.6** (March 18, 2026).

## 📦 Packages

This monorepo is organized into the following packages:

### 🚀 [`packages/burger-api`](./packages/burger-api)

The core **burger-api** framework package. This is the main framework that gets
published to npm.

#### ✨ Key Features

-   ⚡ **Bun-Native Performance** - Leverages Bun's high-performance HTTP server
-   📁 **File-Based Routing** - Automatically registers API routes from your
    file structure
-   🚀 **Optimized Middleware** - Specialized fast paths for 0, 1, 2, and 3+
    middlewares
-   ✅ **Type-Safe Validation** - Utilizes Zod for request validation with full
    type safety
-   📚 **Automatic OpenAPI Generation** - Generates complete OpenAPI 3.0
    specifications
-   🔍 **Swagger UI Integration** - Out-of-the-box Swagger UI endpoint for
    interactive API docs
-   🎯 **Developer Friendly** - Simple, clear middleware patterns that are easy
    to understand

### 🛠️ [`packages/cli`](./packages/cli)

The **Burger API CLI** tool for scaffolding new burger-api projects and managing
your development workflow.

#### ✨ Key Features

-   🚀 **Project Scaffolding** - Create new burger-api projects with interactive
    prompts
-   📦 **Middleware Management** - Browse and add middleware from the ecosystem
-   🔨 **Build Tools** - Bundle projects or compile to standalone executables
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

-   [Bun](https://bun.sh) installed (version 1.2.20 or later)

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

# Framework package only (examples + ecosystem middleware smoke tests)
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
scanning files at runtime. In production builds, routes are discovered at build
time (AOT) so runtime scanning is not needed.

Build flow:

1. CLI scans route/page directories.
2. CLI generates a temporary entry file with static imports.
3. Bun bundles the app and embedded route metadata.
4. Runtime uses embedded routes directly.

This keeps production startup reliable in bundled and executable outputs.

## 🧭 Routing/Build Ownership (Contributor Guide)

If you want to contribute, this split helps:

- Framework route behavior:
  - `packages/burger-api/src/core/api-router.ts`
  - `packages/burger-api/src/core/page-router.ts`
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
│   └── cli/                 # CLI tool (under development)
│       └── src/             # CLI source code
├── ecosystem/               # Middleware templates (ready-to-use)
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
