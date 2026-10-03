# CLI Tests Guide

Tests for the BurgerAPI CLI (`packages/cli`), run with Bun's test runner on
Windows, macOS and Linux.

## Quick commands

From the repo root, run all CLI tests:

```bash
bun run test:cli
```

From `packages/cli`, the same plus typecheck:

```bash
bun run test          # default suite — test/**, minus test/e2e and test/e2e-full
bun run test:e2e      # e2e tests — test/e2e/** (slow, needs network)
bun run test:e2e:full # full CLI e2e — test/e2e-full/** (slow; see below)
bun run typecheck     # tsc --noEmit
```

Run one file or a directory:

```bash
bun test test/scanner.test.ts
bun test ./test/e2e
```

## Test files

- `scanner.test.ts` — route/page/asset path conversion, group/wildcard
  handling, conflict rules.
- `run-command-in-process.test.ts` — the in-process command helper reports
  exit codes even when an action swallows the mocked `process.exit`.
- `route-methods.test.ts` — `detectExportedMethods` reading HTTP method
  exports from route files.
- `config.test.ts` — build config defaults and overrides
  (`resolveBuildConfig`).
- `virtual-entry.test.ts` — generated production build entry source.
- `entry-options.test.ts` — extracting `new Burger({...})` options and
  finding dropped entry code.
- `reindent.test.ts` — source re-indentation helper.
- `inspect.test.ts` — scanner discovery and entry-relative dir fallback.
- `inspect-doctor-json.test.ts` — real CLI `inspect --json` / `doctor --json`
  against a temp project.
- `doctor.test.ts` — `runChecks` (JS projects, real validation, dependency
  state).
- `generate.test.ts` — route/hook/plugin/ws templates and the real
  `generate route` command.
- `generate-ecosystem-hint.test.ts` — `generate hook/plugin` ecosystem-catalog
  hint via a pre-warmed cache (offline).
- `list-skills-stale-cache.test.ts` — stale-cache fallback when GitHub is
  unreachable (offline, via a closed-port proxy).
- `list-fresh.test.ts` — fresh `list` catalog with a mocked GitHub (dir
  filtering, sorting, README descriptions, plugins 500).
- `skills-available-fresh.test.ts` — fresh `skills available` with a mocked
  GitHub (descriptions, truncation, `(could not fetch)`).
- `add.test.ts` — `add` command helpers (`hyphenToCamelCase`,
  `resolveExportName`).
- `add-flow.test.ts` — real `add` command flow (mocked GitHub): hook/plugin
  installs, skip-existing, unknown name, failed download.
- `add-prompt.test.ts` — interactive `add`: the overwrite confirm with a
  scripted `@clack/prompts` mock (`clack-mock.ts`); yes replaces, no/cancel
  leave the install untouched and download nothing.
- `create.test.ts` — `validateProjectName` and `applyFlags` pure functions.
- `create-command.test.ts` — `create` validation paths that exit before
  scaffolding/installing (offline: bad `--lang`, existing dir, traversal,
  bad name).
- `create-prompt.test.ts` — interactive `create` without `--yes`: prompts
  run and a cancelled prompt exits 0 before scaffolding (scripted
  `@clack/prompts` mock; a full answer flow would run `bun install`).
- `create-config.test.ts` — scaffolded config file generation.
- `create-agents.test.ts` — generated AGENTS.md content (no CLAUDE.md).
- `create-index-page.test.ts` — generated landing page.
- `skills-command.test.ts` — `skills` subcommands and skill helpers
  (`parseSkillDescription`, `flattenSkillFiles` with a mocked fetch).
- `skills-install.test.ts` — skill install/list helpers.
- `skills-install-flow.test.ts` — real skill download/install into both
  folders, failure cleanup, and the `skills install` command (mocked GitHub).
- `skills-install-prompt.test.ts` — interactive `skills install`: the
  overwrite confirm with a scripted `@clack/prompts` mock; yes replaces
  both copies, no/cancel keep them and download nothing.
- `github-helpers.test.ts` — GitHub helpers with a mocked fetch
  (`isPrereleaseBuild`, `detectEcosystemType`, downloads, error messages).
- `platform-config.test.ts` — wrangler/deno/vercel config scaffolding
  (content and never-overwrite behavior).
- `dev-command.test.ts` — `dev` boots a temp project and hot-reloads an
  edited route (local package linked, no `bun install`), plus port/entry
  validation before spawning.
- `dev-crash.test.ts` — `dev` keeps the CLI alive after the server crashes
  on startup and respawns it when the entry file is fixed and saved.
- `ecosystem-cache.test.ts` — `withEcosystemCache` freshness/stale behavior.
- `cli-process-exit.test.ts` — ephemeral commands exit without orphaned
  handles; no ANSI escapes on piped output.
- `build-project.test.ts` — `validatePort` pure function.
- `start.test.ts` — `resolveStartEntry` and `newestMtime` pure functions.
- `start-command.test.ts` — `start` action via the real CLI (port
  validation, missing-entry hint, stale-bundle warning, child exit code).
- `build-command.test.ts` — `build` target validation and the cloudflare
  target's portable entry + wrangler.toml (offline).
- `build-self-contained.test.ts` — a bun bundle copied away from its project
  runs with no node_modules (embedded Bun adapter).
- `build-output.test.ts` — runs the production-app example bundle; when the
  bundle is missing it builds it here, offline, from a temp copy of the
  example with the local package linked (see below).
- `build-preserve-options.test.ts` — a production build keeps route hooks and
  constructor options (built from `fixtures/preserve-options`).
- `build-ws.test.ts` — production builds embed file-based WebSocket routes
  (built from `fixtures/ws-app`).
- `build-convention-exports.test.ts` — production builds wire convention
  exports of any syntax (temp project with the local `burger-api` linked in).
- `e2e/scaffold-e2e.test.ts` — scaffold → dev → build → start for TS and JS
  projects, plus new-route watching.
- `e2e/build-exec.test.ts` — a compiled executable boots standalone.
- `e2e/build-target.test.ts` — `--target=cloudflare/vercel` output and
  target validation.
- `e2e/create-e2e.test.ts` — the real `create` command: scaffold + install
  success, and rollback when install fails.
- `e2e/real-console.test.ts` — Windows only: `create` in a real (minimized)
  console window must wait at the first prompt, not crash. Fake-TTY tests
  cannot catch prompt write errors on a real console.
- `e2e/helpers.ts` — shared E2E scaffolding (`scaffoldProject`, `run`,
  `cleanupProjects`); not a test file.
- `e2e-full/helpers.ts` — full-suite plumbing: isolated `$BUN_INSTALL` link
  sandbox, temp projects, deadline-bound command runner, server
  boot/wait/kill (`withServer`), the shared smoke set, and the check table;
  not a test file.
- `e2e-full/blog-fixtures.ts` — the `blog-ts` fixture app (JWT login, posts
  provider, CORS/logger/request-id hooks, WS comments); not a test file.
- `e2e-full/blog-ts.test.ts` — TS + WS project: doctor, inspect, typecheck,
  dev + hot edit, build + start, standalone bundle, `build:exec`, and the
  cloudflare Bun-only warning.
- `e2e-full/site-js.test.ts` — JS + pages project: doctor, inspect,
  typecheck, dev + hot edit, build + start, standalone bundle.
- `e2e-full/api-prefix.test.ts` — `/v1` project: the above plus
  `--target=node` under Node >= 24, `--target=deno` under `deno serve`, and
  `--target=cloudflare` under `wrangler dev`.
- `e2e-full/zz-summary.test.ts` — runs last and prints the
  check → pass/skip/fail table.

## E2E tests (slow, need network)

`test/e2e/**` scaffolds a project, rewrites `burger-api` to the local
package as a `file:` dependency, and runs `bun install`, which downloads
dependencies from npm. They are the slowest tests and need network (or a
warm Bun cache). They also run `bun run dev` / `build` / `start`, so give
them several minutes.

They are not part of the default suite: `bun run test` ignores
`test/e2e/**` via `--path-ignore-patterns`. Run them with `bun run test:e2e`
(or `bun test ./test/e2e`). The root `test:all` runs both CLI suites
(`cli` and `cli-e2e`).

## Full CLI end-to-end suite (`test:e2e:full`)

`test/e2e-full/**` is the permanent, repeatable "use it like a real user"
suite: it creates three projects with the real CLI in local mode
(`BURGER_API_LOCAL=1`), linked through an isolated `$BUN_INSTALL` sandbox so
the developer's global `bun link` store is never touched, then drives each of
them through the CLI and a running server. It needs no network beyond the
Bun cache (`$BUN_INSTALL_CACHE_DIR` reuses the host cache), and every project
lives in an OS temp dir that is removed at the end.

Projects and what they prove:

- `blog-ts` (`--ws`) — JWT login (`signJwt`), an in-memory posts provider,
  zod validation, per-method `config.ts` auth, CORS/logger/request-id hooks,
  and a WS comments route that receives a `ctx.publish` broadcast from
  `POST /api/posts`. Covers doctor, inspect, typecheck, dev with a hot route
  edit, build + start, a standalone `.build/bundle/app.js` copy, `build:exec`
  (compiled binary copy), and the cloudflare Bun-only warning (build only).
- `site-js` (`--lang js --pages`) — pages plus API: doctor, inspect,
  typecheck (jsconfig), dev + hot edit, build + start, standalone bundle.
- `api-prefix` (`--api-prefix /v1`) — `/v1` routing (and `/api` 404s), the
  same dev/build/standalone checks, plus `--target=node` run under Node >= 24,
  `--target=deno` run under `deno serve`, and `--target=cloudflare` run under
  `wrangler dev`.

Each check also asserts the shared smoke set over real HTTP: health 200,
unknown path 404, validation 422, auth (no token 401 → login → protected
POST 201), CORS header with an `Origin`, `/openapi.json` title, `/docs` 200,
and (blog-ts) a WebSocket broadcast within 5s.

Prerequisites: Bun; optionally Node >= 24 (node target), deno, and wrangler
(cloudflare target). A missing/too-old runtime records a **SKIP** with the
reason instead of failing — on a machine with all three installed the suite
is 23/23 PASS with no skips.

Run it from `packages/cli`:

```bash
bun run test:e2e:full
```

Expected duration: under a minute on a warm Bun cache (server boots are
bounded, and `build:exec` is the slowest single check). The suite prints a
`E2E full summary` table (check → PASS/SKIP/FAIL) when it finishes. To include
it at the end of the repo-wide run, set `E2E_FULL=1`:

```bash
E2E_FULL=1 bun run test:all   # root; adds the cli-e2e-full suite
```

## Optional environment variables

- `BUILD_BUNDLE_PATH`
  - Custom path to the bundle run by `build-output.test.ts`; the example is
    built on demand there when the file is missing.
- `BURGER_API_CLI_LIST_EXIT_TEST=1`
  - Runs the GitHub-backed `burger-api ls` exit test (skipped by default).
- `BURGER_API_CLI_SKILLS_EXIT_TEST=1`
  - Runs the GitHub-backed `burger-api skills available` exit test (skipped
    by default).

## Building the bundle for `build-output.test.ts`

`build-output.test.ts` never skips: when the bundle below is missing it
copies the production-app example into a temp dir, links the local
`burger-api` package there (no `bun install`, no network), runs the CLI
build from there, and copies the bundle to the expected path.

```bash
# Optional: build it by hand instead (requires the framework dist):
cd packages/burger-api/examples/production-app
bun run ../../../cli/src/index.ts build src/index.ts --outfile .build/bundle/app.js
cd ../../../cli
bun test test/build-output.test.ts
```

## Interactive prompt tests and module mocks

Bun 1.4 does not isolate `mock.module()` per test file, and
`mock.restore()` does not undo a module mock. The prompt tests therefore
live in their own files, install the mock before importing the command
under test (`clack-mock.ts`), and re-register the real module in `afterAll`
so later files in the same process see it untouched.