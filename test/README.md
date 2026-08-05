# Root-level Tests (`test/`)

This folder holds **workspace-level** tests that live at the repository root
(not inside `packages/burger-api/test/`). They cover behavior that spans
packages or the public contract, rather than framework-internal units.

## What lives here

| File                 | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `router.test.ts`     | Hybrid Router dispatch (static / `:param` / `*`, precedence, auto-HEAD, loose slash, 405 + `Allow`, hook delegation, `AllowCache`, compile-time duplicate/ambiguous guards). |
| `route-sync.test.ts` | CLI ↔ framework **path-conversion parity**: verifies that the CLI's
                      route-path generation and the framework's runtime path
                      conversion agree (e.g. `[id]` ⇄ `:id`, `[...]` ⇄ `*`). Cross-package by nature, so it stays at the root. |

## How to run

Run **everything** from the repository root (this is the canonical entry
point):

```bash
bun run test          # alias for test:all
bun run test:all      # full suite + typecheck (route-sync, router, framework, ecosystem, cli, unit)
```

Run just this folder:

```bash
bun test test/route-sync.test.ts
bun test test/router.test.ts
```

## Relationship to package tests

Framework-internal tests (the prototype-based `BurgerContext`, `parseQuery`,
`applySet`, `RouteAccessAnalyzer`, and `Router` context threading) live under
`packages/burger-api/test/context/` and are run as part of `test:all` via the
`context` step. Keep new framework-internal tests there; keep cross-package /
public-contract tests here.
