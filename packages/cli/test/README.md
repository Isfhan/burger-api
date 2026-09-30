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
bun run test        # default suite — test/**, minus test/e2e
bun run test:e2e    # e2e tests — test/e2e/** (slow, needs network)
bun run typecheck   # tsc --noEmit
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