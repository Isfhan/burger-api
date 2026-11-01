# Changelog: @burger-api/cli

## Unreleased

- `build` on Windows: rebuilding while the app still runs from the old build
  now says to stop the app first, instead of failing with a raw `EBUSY` error.

## 1.0.0-beta (November 2, 2026)

> **A new CLI for the new BurgerAPI.** 1.0.0-beta is a rewrite that goes with
> `burger-api@1.0.0-beta`, not an update to `0.9.9`. It scaffolds,
> builds and checks projects for the new framework.
>
> `npm i -g @burger-api/cli` now installs 1.0.0-beta. The old line stays on npm
> as `@burger-api/cli@0.9.9`. Upgrading an existing app? Follow
> [Migrating from 0.9.x](https://burger-api.com/docs/migration).
>
> This is a beta: please [open an issue](https://github.com/isfhan/burger-api/issues)
> if anything breaks or feels wrong.

### Requirements

- **Bun 1.4.4+** (October 2026 security fixes).
- Published to npm with provenance.

### Highlights

- **`create`** for TypeScript or JavaScript projects, with optional pages,
  WebSocket routes and AI agent skills.
- **`generate`** for routes, hooks, plugins and WebSocket routes.
- **`inspect` and `doctor`** to see and check a project, with `--json` output
  for tools and AI agents.
- **`build --target`** for Bun, Node, Cloudflare Workers, Deno and Vercel.
- **A more reliable `dev`** that picks up new route folders without a restart.

### Breaking changes from 0.9.x

- `burger-api serve` is removed: use `burger-api dev`.
- `burger.config.ts` is no longer read: rename it to `burger.build.ts`.

### What's new

**`create`**

- `--lang ts|js`: JavaScript projects use `jsconfig.json` with type checking
  and JSDoc types.
- `--yes` / `--defaults`, `--pages`, `--ws`, `--no-api`, `--api-dir`,
  `--api-prefix` and `--no-skills`. Without a terminal (CI), `create` never
  prompts.
- Every project gets an `AGENTS.md` with rules for AI agents, and TypeScript
  projects get a `src/types.ts` for app-wide types.
- New projects type-check with `bun check` and use TypeScript 7.
- If setup fails, the half-created folder is removed.

**`generate` (alias `g`)**

- `generate route|hook|plugin|ws <name>` follows the project's language
  (or `--lang`).
- `generate hook` and `generate plugin` tell you when an official package
  already exists, so you can `burger-api add` it instead.

**`add`, `list` and `skills`**

- `add` works for both hooks and plugins and prints the exact code to wire
  them in.
- `--force` replaces an existing install without a prompt.
- The ecosystem list is cached locally for a few hours. If GitHub is
  unreachable, the CLI uses the cached copy and says so.
- Downloads come from the `main` branch (override with `BURGER_API_BRANCH`).
- `skills install` puts skills in both `.agents/skills/` and
  `.claude/skills/`, so every agent finds them.

**`build` and `build:exec`**

- `--target=bun|node|cloudflare|deno|vercel` writes a ready-to-deploy build for
  each platform.
- Portable targets warn about Bun-only code (`Bun.*`, `bun:*`, pub/sub).
- Production builds keep every route file (`hooks`, `schema`, `openapi`,
  `config`) and every app file, for TypeScript and JavaScript.
- Projects with pages build and run with custom prefixes.

**`dev` and `start`**

- `dev` watches the whole app folder and keeps running after a crash.
- `start` names the file it runs and warns when the build is older than
  `src/`.
- Both check `--port` (1–65535).

**`inspect` and `doctor`**

- `inspect` lists every route, hook, plugin and convention file.
- `doctor` checks the project structure, the config files, that every route
  loads, and your Bun and Node versions. It exits with an error code on
  failure.
- `--json` on both gives one versioned result object.

**Install and update**

- The install scripts remove old versions first (a global `@burger-api/cli`
  from Bun or npm, and the previous executable), and warn when another
  `burger-api` still comes first on `PATH`.
- Unexpected errors end with a hint to update to the latest CLI.

**Local mode**

- `--local` (or `BURGER_API_LOCAL=1`) uses your local burger-api checkout
  instead of npm and GitHub. For working on BurgerAPI itself.

---

## Previous versions (0.x)

### 0.9.9 (June 29, 2026)

- Added `skills install`, `skills list` and `skills available`.
- `create` asks whether to add AI agent skills, which replace
  `.llm-context/`.

### 0.9.8 (May 16, 2026)

- The scaffolded `index.html` uses your API prefix and folder names.

### 0.9.7 (May 16, 2026)

- Commands exit cleanly when they finish; Ctrl+C handling for `serve`.

### 0.9.6 (March 18, 2026)

- `create` writes a `burger.config.ts` from your answers.
- One build pipeline for bundles and executables, with routes found at build
  time.
- Production builds keep middleware and OpenAPI options.

### 0.7.0 (December 23, 2025)

- Published to npm as `@burger-api/cli` (`bun add -g @burger-api/cli`).

### 0.6.6 (December 23, 2025)

- Added `.llm-context` AI context files to new projects.

### 0.6.3 (December 17, 2025)

- Added a release workflow for executables.

### 0.1.0 (December 14, 2025)

- First release: `create`, `list`, `add`, `build`, `build:exec` and `serve`,
  on Windows, macOS and Linux.
