## 📣 Release Notes - Burger API CLI

All notable changes to the Burger API CLI will be documented in this file.

## Version 1.0.0-beta - (September 6, 2026)

First public beta, tracking `burger-api@1.0.0-beta`. `npm i -g @burger-api/cli`
installs this beta by default; pin an exact `0.9.x` version (e.g.
`npm i -g @burger-api/cli@0.9.9`) if you need the previous stable line.

- **Added** – `--lang ts|js` and `--yes`/`--defaults` flags on `create`; JS
  scaffolds use `jsconfig.json` (`checkJs: true`) and `.js` convention files
  with JSDoc types.
- **Added** – `-l, --lang` on `generate route|hook|plugin|ws`; language
  auto-detected via `jsconfig.json` presence.
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
- **Added** – `generate hook <name>`/`generate plugin <name>` now check the
  ecosystem catalog first (via the same cached lookup `add`/`list` use) and
  warn — suggesting `burger-api add <name>` instead — when a real, working
  implementation already exists under that name, rather than silently
  producing a same-named blank stub. Non-blocking: the local stub is still
  created either way; this is a hint, not a behavior change.
- **Added** – local caching (`~/.burger-api/cache/`, a few hours TTL) for
  the ecosystem catalog `add`/`list`/`available`/`skills available` all
  read from. Previously every invocation hit GitHub's Contents API live —
  slow, and it broke outright offline or when GitHub was unreachable. Now
  falls back to a stale cached copy (with a warning) when a live refresh
  fails and a cache exists; a cold cache with no network still fails loud,
  same as before.
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
- **Fixed** – `doctor` reported false failures on JavaScript projects: it
  now recognizes `src/index`/`hooks`/`plugins`/`openapi.config` as `.ts`,
  `.js`, or `.mjs`, and accepts `jsconfig.json` in place of `tsconfig.json`.
- **Fixed** – `create`'s "next steps" pointed JS projects at
  `burger.build.ts`; it now names `burger.build.js`.
- **Fixed** – `build --target=node` now fails early with an install hint
  when `@burger-api/node-server` isn't in the project, instead of a
  confusing bundler resolution error.
- **Fixed** – scaffolded projects pin the exact `zod` version the CLI's own
  `burger-api` resolves, instead of an independent `^4.0.17` range. Two zod
  copies (even adjacent patch versions) made TypeScript fail with `TS2589`.
- **Fixed** – `generate ws` scaffolded `maxPayloadLength`/`idleTimeout` in
  the route's `config`, which are connection-level options ignored per
  route. The template now shows the valid per-route `auth` override.
- **Changed** – `generate ws` now uses `config.wsDir` (was hardcoded
  `src/websocket`).
- **Changed** – API + WS scanners accept `.ts`/`.js`/`.mjs` conventions and
  fail loud when conflicting files coexist (e.g. `route.ts` + `route.js`).
- **Removed** – `burger-api serve` command (use `dev`); `burger.config.ts`
  renamed `burger.build.ts` (build-time only).
- **Changed** – Scaffold pins `burger-api@^1.0.0-beta` (was `^1.0.0`, which
  excludes prereleases), so scaffolded projects resolve the beta and pick up
  later betas and the eventual stable `1.x`.
- **Fixed** – Production builds could silently drop a route's `hooks` file
  (bypassing auth) depending on the export syntax. The build now imports any
  sibling `hooks`/`schema`/`openapi`/`config` file, whatever its exports look
  like, and reads them at startup exactly like dev.
- **Fixed** – `--pages` projects failed to build: the landing page's
  root-absolute `{pagePrefix}/assets/...` URLs were handed to Bun's HTML
  bundler. HTML pages are embedded as raw markup and served from the embedded
  asset table, so custom `pagePrefix` values work in production too.
- **Fixed** – The build entry no longer emits its own OPTIONS stub; the
  framework's 204 + `Allow` OPTIONS handler now applies in production.
- **Fixed** – Scaffolded `burger.build.*` files are typed
  `Partial<BuildConfig>`, so a project without pages typechecks out of the box.
- **Fixed** – App-level convention files (`hooks`/`plugins`/`providers`/
  `openapi.config`) are resolved with `.ts`/`.js`/`.mjs` next to the entry in
  production builds (JS builds used to lose them); conflicting extensions fail
  loud. Portable targets write relative POSIX imports, a `.js` options module
  for JS projects, pin `deno.json` to the project's `burger-api` range, and
  clean their `.build/<target>/` output dir before writing.
- **Fixed** – Non-TTY/CI output has no ANSI escapes or spinner frames;
  `create` uses defaults with a notice instead of hanging when there is no TTY
  and no `--yes`; reserved Windows names are rejected, `package.json`'s name
  is lowercased, and a failed `create` removes its partial directory.
- **Fixed** – `generate` sanitizes identifiers (`rate-limit` → `rateLimit`),
  rejects names/paths that escape the project, and prints correct
  `../ecosystem/...` import snippets with the identifier the file exports.
- **Changed** – `doctor` uses `burger.build`'s `apiDir`, verifies `burger-api`
  resolves in `node_modules`, fails on unloadable configs and broken route
  modules (it imports them), reports optional files as info, and warns when
  `src/index.*` and `burger.build.*` disagree.
- **Changed** – `start` names the entry it runs and warns when the bundle is
  older than `src/`; `dev`/`start` validate `--port` (1–65535); `dev` keeps
  watching after a crash and waits for a killed child's port before respawning
  on Windows.
- **Changed** – `inspect` handles `.ts`/`.js`/`.mjs` convention files and
  reports "found, no hooks registered" for empty hook files; `list` caches
  descriptions and kinds (a warm cache makes zero GitHub calls) and warns when
  showing stale data; GitHub 403s surface the status and a `GITHUB_TOKEN` hint.

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

