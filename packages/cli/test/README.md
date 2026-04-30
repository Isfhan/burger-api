# CLI Tests Guide

This folder has tests for the Burger API CLI build flow.

## Quick commands

**From repo root** — run all CLI tests:

```bash
bun run test:cli
```

**From `packages/cli`** — run all CLI tests:

```bash
bun run test
```

Or run only the build-related tests (checks that production build behaves like dev):

```bash
bun run test:build
```

Run one test file:

```bash
bun test test/scanner.test.ts
```

## What each test file checks

- `scanner.test.ts`
  - Checks API/page route path conversion.
  - Checks conflict rules for dynamic/wildcard folders.
- `config.test.ts`
  - Checks build config defaults and override behavior.
- `virtual-entry.test.ts`
  - Checks generated build entry source content.
- `entry-options.test.ts`
  - Checks extraction of `new Burger({...})` options from the user entry file.
- `build-output.test.ts`
  - Checks built bundle can run and respond.
- `build-preserve-options.test.ts`
  - Integration test that builds a fixture app and verifies global middleware is preserved in production bundle output.

## Optional environment variables

- `BUILD_BUNDLE_PATH`
  - Custom path to built `app.js` used by `build-output.test.ts`.
- `REQUIRE_BUILD_BUNDLE=true`
  - Force `build-output.test.ts` to fail if bundle file is missing.
- `CI=true`
  - CI mode also forces missing bundle to fail.

## Typical local flow

1. Build your sample app bundle.
2. Run CLI tests.

Example:

```bash
cd packages/burger-api/examples/file-base-api-routing
bun run ../../../cli/src/index.ts build index.ts --outfile .build/bundle/app.js
cd ../../../cli
bun test test/build-output.test.ts
```

## Troubleshooting

- If `build-output.test.ts` says bundle not found:
  - Build the app first, or
  - Set `BUILD_BUNDLE_PATH` to your bundle file.
- If tests fail only in CI:
  - Check that CI creates the bundle before running tests.
