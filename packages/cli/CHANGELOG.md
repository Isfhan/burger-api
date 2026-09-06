## 📣 Release Notes - Burger API CLI

All notable changes to the Burger API CLI will be documented in this file.

## Version 1.0.0-beta.1 - (September 6, 2026)

First public beta, tracking `burger-api@1.0.0-beta.1`. Install with
`npm i -g @burger-api/cli@beta`.

- **Added** – `useWs`/WebSocket-routes prompt on `create` (mirrors the
  existing `usePages` prompt), scaffolding a sample `src/websocket/echo/`
  route and wiring `wsDir` into both `src/index.ts` and `burger.build.ts`
  when opted in.
- **Added** – `inspect` and `doctor` commands: `inspect` prints every
  discovered route/hook/plugin/convention-file; `doctor` validates project
  structure (missing entry file, no discoverable routes, a leftover legacy
  `burger.config.ts`, etc.) and exits non-zero on failure.
- **Added** – `--json` on both `inspect` and `doctor`: emits a single
  structured, versioned JSON object (`InspectResult`/`DoctorResult`,
  `version: 1`) instead of colored console text — for tooling and AI
  agents that need to read a project's shape programmatically rather than
  parse formatted output. Exit-code behavior on `doctor` is unchanged.
- **Added** – `generate ws <path>` scaffolds a WebSocket handler directory
  (`ws.ts`/`hooks.ts`/`config.ts`).
- **Fixed** – `burger-api add`'s printed "How to Use" snippet showed an
  invalid identifier for any hyphenated package (`jwt-auth` → `Jwt-auth`,
  a syntax error) and, even fixed, guessed the wrong case and omitted the
  factory call entirely (`rate-limiter` really exports `rateLimit()`,
  `cache` exports `cacheControl()` — a naive rename can't predict these).
  Now resolves the real exported name by reading the downloaded file.
- **Fixed** – `burger-api dev` only restarted on changes to files already
  reachable from the entry's import graph (`bun --watch`'s own
  limitation), so a brand-new route directory 404'd until the dev server
  was manually restarted. `dev` now owns a recursive filesystem watcher
  covering the whole app directory.
- **Fixed** – `burger-api build:exec` produced an executable that crashed
  immediately on startup (see the framework CHANGELOG for the root cause).
- **Changed** – Scaffold pins `burger-api@^1.0.0-beta.1` (was `^1.0.0`) for
  the duration of the beta, so scaffolded projects track beta releases and
  don't jump to a future stable `1.0.0` mid-beta.
- **Known limitation** – `add`/`list`/`skills install` default to GitHub's
  `main` branch, which doesn't have this release's ecosystem content yet.
  Set `BURGER_API_BRANCH=feat/burger-api-v1` until `main` is updated.

## Version 1.0.0 - (August 2, 2026)

- **Added** – `--lang ts|js` and `--yes`/`--defaults` flags on `create`; JS
  scaffolds use `jsconfig.json` (`checkJs: true`) and `.js` convention files
  with JSDoc types.
- **Added** – `-l, --lang` on `generate route|hook|plugin|ws`; language
  auto-detected via `jsconfig.json` presence.
- **Changed** – `generate ws` now uses `config.wsDir` (was hardcoded
  `src/websocket`).
- **Changed** – API + WS scanners accept `.ts`/`.js`/`.mjs` conventions and
  fail loud when conflicting files coexist (e.g. `route.ts` + `route.js`).
- **Changed** – Scaffold pins `burger-api@^1.0.0`.
- **Removed** – `burger-api serve` command (use `dev`); `burger.config.ts`
  renamed `burger.build.ts`.
- **Aligned** – With `burger-api` 1.0.0 vision-locked API.

## Version 0.10.0 - (July 24, 2026)

- **Changed** – Scanner no longer detects `globalHooksPath` inside `apiDir`.
 Global hooks now live at app root (sibling of `index.ts`), not inside the
 routes directory.
- **Changed** – Virtual-entry: removed global tier hooks merge logic.
- **Aligned** – With `burger-api` 0.15.0 self-contained route architecture.

## Version 0.9.9 - (June 29, 2026)

- **Added** – `burger-api skills install [name]` to download AI agent skills
 (defaults to `burger-api`).
- **Added** – `burger-api skills list` to show locally installed skills.
- **Added** – `burger-api skills available` to list remote skills from the
 ecosystem.
- **Added** – Optional "Add AI agent skills?" prompt during `create` (default:
 yes).
- **Changed** – `create` no longer auto-installs `.llm-context/`. Skills are
 downloaded to `.agents/skills/burger-api/` instead.
- **Migration** – Existing projects with `ecosystem/.llm-context/` can adopt
 the new format with `burger-api skills install`.

## Version 0.9.8 - (May 16, 2026)

- **Create** – Scaffolded `index.html` uses your API route prefix and
 `src/<apiDir>` / `src/<pageDir>` paths in hints and the “Try API” link;
 pages-only projects no longer show a broken `/api` link or API file hint.
- **Tests** – Coverage for `generateIndexPage` (custom prefix, defaults,
 pages-only).

## Version 0.9.7 - (May 16, 2026)

- **CLI** – One-shot commands return to the shell reliably (GitHub `fetch`
 timeouts clear after each request; `bun install` stderr is drained).
- **CLI** – `parseAsync` at the entry so async command errors do not strand
 the process.
- **CLI** – `serve` uses one-shot signal listeners (`once`) for Ctrl+C /
 Ctrl+Break.
- **Tests** – Process-exit checks for `--version` and invalid `list` flags;
 optional GitHub `ls` test via `BURGER_API_CLI_LIST_EXIT_TEST=1`.

## Version 0.9.6 - (March 18, 2026)

- ✨ **Create** – New projects get a config file (`burger.config.ts`) from
 your answers; the build uses this config when present.
- 🔨 **Build** – One build pipeline for both bundle and executable; routes
 are found at build time so production is fast and reliable.
- 📂 **Defaults** – Executable output: `.build/executable/<project>` (or
 `.exe` on Windows); bundle: `.build/bundle/app.js`.
- 🧪 **Tests** – New tests for routes, config, and build output; CI catches
 broken builds early.
- 🐛 **Fixed** – Invalid route combinations are caught at build time.
- 🐛 **Fixed** – Production build keeps your middleware and options (e.g.
 title, description) instead of dropping them.
- 📚 **Docs** – README updated with production build steps and test
 commands.

## Version 0.7.0 - (December 23, 2025)

### Added
- npm publishing support - CLI is now available on npm as `@burger-api/cli`
- Users can install via `bun add -g @burger-api/cli` or use `bunx @burger-api/cli`
- Lightweight npm package (~27KB) as alternative to 100MB executables
- GitHub Actions workflow for automated npm publishing (when organization is configured)


## Version 0.6.6 - (December 23, 2025)

### Added
- `.llm-context` folder to the project with AI context files
- `llms.txt`, `llms-small.txt`, and `llms-full.txt` files
- Updated README.md

## Version 0.6.3 - (December 17, 2025)

### Added
- GitHub Actions release workflow
- Updated README.md

## Version 0.1.0 - (December 14, 2025)

### Added
- Initial release of Burger API CLI
- `create` command to generate new projects with interactive prompts
- `list` command to show available middleware from ecosystem
- `add` command to download and install middleware
- `build` command to bundle projects to single JS file
- `build:exec` command to compile to standalone executable
- `serve` command for development server with hot reload
- Beautiful console output with colors and symbols
- Zero external dependencies for file operations (uses Bun's native APIs)
- Comprehensive documentation and examples
- Support for Windows, macOS, and Linux

### Technical Details
- Built with TypeScript and Bun.js
- Uses only 2 dependencies: `commander` and `@clack/prompts`
- All file downloads use Bun's native `fetch()` API
- All file operations use Bun's fast file system APIs
- All process spawning uses `Bun.spawn()`
- Comprehensive JSDoc comments throughout codebase

## Release Process

See [RELEASING.md](./RELEASING.md) for the release process.

---

## Change Categories

We use these categories to organize changes:

- **Added** - New features or commands
- **Changed** - Changes to existing functionality
- **Deprecated** - Features that will be removed in future
- **Removed** - Features that have been removed
- **Fixed** - Bug fixes
- **Security** - Security improvements

