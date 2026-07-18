# CLI Command Reference

## Installation

```bash
# Global install via Bun
bun add -g @burger-api/cli

# Or use via bunx (no install needed)
bunx @burger-api/cli create my-project

# Or standalone executable
curl -fsSL https://burger-api.com/install.sh | bash
```

## Commands

### `create <project-name>`

Scaffold a new BurgerAPI project with interactive prompts:

```bash
burger-api create my-api
```

Prompts for: API routes (y/n), API directory name, API prefix, debug mode, page routes (y/n), page directory name, page prefix, AI skills (y/n).

### `add <middleware...>`

Download middleware from the ecosystem into the project:

```bash
burger-api add cors logger rate-limiter
```

Downloads to `ecosystem/middleware/<name>/`. Shows import instructions after success.

### `skills install [name]`

Download AI agent skills into the project:

```bash
burger-api skills install
burger-api skills install burger-api
```

Downloads to `.agents/skills/<name>/`. Compatible with Cursor, Claude Code, opencode, Codex, and other agentic tools.

### `skills list`

List locally installed skills:

```bash
burger-api skills list
```

Reads from `.agents/skills/<name>/SKILL.md` frontmatter to show descriptions.

### `skills available`

List all skills available on GitHub:

```bash
burger-api skills available
```

Fetches from the ecosystem repository and shows descriptions parsed from each
skill's `SKILL.md`. Install one with `burger-api skills install <name>`.

### `list`

List available middleware from the ecosystem:

```bash
burger-api list
```

### `serve`

Start a development server with hot reload:

```bash
burger-api serve
burger-api serve --port 4000
burger-api serve --file src/index.ts
```

### `build <file>`

Bundle the project for production (route discovery prepared ahead of time, AOT):

```bash
burger-api build src/index.ts
burger-api build src/index.ts --minify --outfile dist/app.js
```

Default output: `.build/bundle/app.js`

### `build:exec <file>`

Compile to a standalone executable (no Bun required on target):

```bash
burger-api build:exec src/index.ts
burger-api build:exec src/index.ts --target bun-linux-x64
```

Default output: `.build/executable/<project>` (or `.exe` on Windows)

## Production Build Flow

1. CLI scans the apiDir and pageDir when the app is built
2. CLI generates a temporary entry file with static imports
3. Bun bundles the app with embedded route metadata
4. The running server uses embedded routes directly (no filesystem scanning)
