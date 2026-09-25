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

Prompts for: API routes (y/n), API directory name, API prefix, debug mode, page routes (y/n), page directory name, page prefix, WebSocket routes (y/n), WebSocket directory name, AI skills (y/n).

Flags: `-l, --lang <ts|js>` (skip the language prompt), `-y, --yes` (accept all defaults, non-interactive).

### `add <names...>`

Download hooks and plugins from the ecosystem into the project:

```bash
burger-api add cors logger rate-limiter
```

Downloads to `ecosystem/hooks/<name>/` (or `ecosystem/plugins/<name>/`). Shows import
instructions after success — the printed snippet uses the package's real
exported factory name (resolved from the downloaded file, e.g. `jwtAuth()`,
`rateLimit()`), not a guess from the package name, so it's always
pasteable as-is.

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

List available hooks and plugins from the ecosystem:

```bash
burger-api list
```

### `dev`

Start a development server with hot reload:

```bash
burger-api dev
burger-api dev --port 4000
burger-api dev --file src/index.ts
```

### `build <file>`

Bundle the project for production (route discovery prepared ahead of time, AOT):

```bash
burger-api build src/index.ts
burger-api build src/index.ts --minify --outfile dist/app.js
```

Default output: `.build/bundle/app.js`

### `start`

Run the production build without hot reload (sets `NODE_ENV=production`):

```bash
burger-api start
burger-api start --port 8080
burger-api start --file dist/index.js
```

Entry resolution priority: `--file` flag → `.build/bundle/app.js` (if it
exists) → `src/index.ts`.

### `generate route <path>`

Scaffold a route directory with convention files:

```bash
burger-api generate route users
burger-api generate route "products/[id]"
burger-api generate route users --no-schema --no-openapi
```

Flags: `-l, --lang <ts|js>`, `--no-schema`, `--no-openapi`, `--no-hooks`, `--no-config` (each convention file is included by default; opt out per-file).

### `generate ws <path>`

Scaffold a WebSocket handler directory (`ws.ts` + `hooks.ts` + `config.ts` by default) under `wsDir`:

```bash
burger-api generate ws chat
burger-api generate ws "notifications/[room]"
```

Flags: `-l, --lang <ts|js>`, `--no-hooks`, `--no-config`.

### `generate hook <name>`

Scaffold a hook factory under `ecosystem/hooks/<name>/`:

```bash
burger-api generate hook my-hook
```

### `generate plugin <name>`

Scaffold a plugin under `ecosystem/plugins/<name>/`:

```bash
burger-api generate plugin my-plugin
```

### `inspect`

Print a summary of everything discovered in the project — config, API/page/WebSocket routes, hooks, plugins, and convention-file coverage:

```bash
burger-api inspect
```

Useful to sanity-check a project after scaffolding — a route missing from the printed list usually means a naming or `apiDir` mismatch, not a routing bug.

### `doctor`

Validate project structure and report issues (missing `src/index.ts`, no discoverable routes, a leftover legacy `burger.config.ts`, etc.):

```bash
burger-api doctor
```

Exits `0` when every check passes, `1` otherwise — safe alongside `bun run typecheck` in CI.

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
