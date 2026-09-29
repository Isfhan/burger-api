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
bun run test        # all tests
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
- `add.test.ts` — `add` command helpers (`hyphenToCamelCase`,
  `resolveExportName`).
- `add-flow.test.ts` — real `add` command flow (mocked GitHub): hook/plugin
  installs, skip-existing, unknown name, failed download.
- `create.test.ts` — `validateProjectName` and `applyFlags` pure functions.
- `create-config.test.ts` — scaffolded config file generation.
- `create-agents.test.ts` — generated AGENTS.md/CLAUDE.md content.
- `create-index-page.test.ts` — generated landing page.
- `skills-command.test.ts` — `skills` subcommands and skill helpers
  (`parseSkillDescription`, `flattenSkillFiles` with a mocked fetch).
- `skills-install.test.ts` — skill install/list helpers.
- `skills-install-flow.test.ts` — real skill download/install into both
  folders, failure cleanup, and the `skills install` command (mocked GitHub).
- `github-helpers.test.ts` — GitHub helpers with a mocked fetch
  (`isPrereleaseBuild`, `detectEcosystemType`, downloads, error messages).
- `platform-config.test.ts` — wrangler/deno/vercel config scaffolding
  (content and never-overwrite behavior).
- `dev-command.test.ts` — `dev` boots a temp project and hot-reloads an
  edited route (local package linked, no `bun install`).
- `ecosystem-cache.test.ts` — `withEcosystemCache` freshness/stale behavior.
- `cli-process-exit.test.ts` — ephemeral commands exit without orphaned
  handles; no ANSI escapes on piped output.
- `build-project.test.ts` — `validatePort` pure function.
- `start.test.ts` — `resolveStartEntry` and `newestMtime` pure functions.
- `build-output.test.ts` — runs a pre-built production bundle (skipped when
  missing; see below).
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
- `e2e/helpers.ts` — shared E2E scaffolding (`scaffoldProject`, `run`,
  `cleanupProjects`); not a test file.

## E2E tests (slow, need network)

`test/e2e/**` scaffolds a project, rewrites `burger-api` to the local
package as a `file:` dependency, and runs `bun install`, which downloads
dependencies from npm. They are the slowest tests and need network (or a
warm Bun cache). They also run `bun run dev` / `build` / `start`, so give
them several minutes.

## Optional environment variables

- `BUILD_BUNDLE_PATH`
  - Custom path to the built bundle used by `build-output.test.ts`.
- `REQUIRE_BUILD_BUNDLE=true`
  - `build-output.test.ts` fails (instead of skipping) when the bundle is
    missing. `CI=true` does the same.
- `BURGER_API_CLI_LIST_EXIT_TEST=1`
  - Runs the GitHub-backed `burger-api ls` exit test (skipped by default).
- `BURGER_API_CLI_SKILLS_EXIT_TEST=1`
  - Runs the GitHub-backed `burger-api skills available` exit test (skipped
    by default).

## Building the bundle for `build-output.test.ts`

```bash
cd packages/burger-api/examples/production-app
bun run ../../../cli/src/index.ts build src/index.ts --outfile .build/bundle/app.js
cd ../../../cli
bun test test/build-output.test.ts
```

Without a bundle the file is reported as skipped; set
`REQUIRE_BUILD_BUNDLE=true` to make it a hard failure.