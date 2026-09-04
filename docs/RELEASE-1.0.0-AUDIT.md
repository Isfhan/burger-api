# BurgerAPI v1.0.0 Release Audit — Running Log

Single durable log for the v1.0.0 release-closure effort. The four root `.md` audit
documents (`BURGERAPI_VISION.md`, `burgerapi-request-lifecycle.md`, `audit.md`,
`MANUAL_TEST_CHECKLIST.md`) were harvested into this file and deleted per Phase 0 of
the release plan — nothing else referenced them.

Format: each phase gets a checkpoint entry — what was checked, what broke, what was
fixed, what's still open.

---

## Harvested from `audit.md` (deleted 2026-09-05)

### §17 Prioritized Issues (F1–F20)

| Issue | Category | Priority | Human Impact | AI Impact | Complexity |
|-------|----------|----------|-------------|-----------|------------|
| F1 Installed stale middleware-era skill | AI-DX/Docs | **P0** | Generates broken projects | Agent emits non-compiling code | Low |
| F2 Route `onRequest` silently ignored | API/AI-DX/Docs | **P0** | Auth checks never run | Agent writes no-op hooks | Med |
| F3 Programmatic WS/`wsConfig` dropped in prod | Runtime/DX | P1 | Prod missing WS routes | Unexpected prod behavior | Med |
| F4 Scaffold WS `config.ts` emits ignored keys | DX/API/Docs | P1 | Config is a no-op | Agent repeats the trap | Low |
| F5 Unresolvable deep import subpaths in docs | AI-DX/TS/Docs | P1 | Type errors | Agent writes failing imports | Low |
| F6 Wrong global-hooks path in skill (`api/hooks.ts`) | Docs/AI-DX | P1 | Hooks file is a no-op | Agent scaffolds wrong path | Low |
| F7 Inline vs file convention contradiction | API/Docs/AI-DX | P1 | Confusing; two truths | Agent guesses which is valid | Med |
| F8 WS route params need unsafe cast | TS/DX/AI-DX | P1 | Ugly casts | Agent can't type params | Med |
| F9 `config.auth` only via plugin; `RouteConfig` empty | API/TS/DX | P1 | Auth seems unenforced | Agent mis-types config | Med |
| F10 `src/ws` vs `src/websocket` naming | Naming/Docs/DX | P1 | Directory guesswork | Agent scaffolds wrong dir | Low |
| F11 Vestigial `ecosystem/hooks/index.ts` | DX/Docs/Maint | P2 | Confusing dead file | Agent may import it | Low |
| F12 Inconsistent generated hook shape (fn vs array) | DX/Consistency | P2 | Style mismatch | Inconsistent generation | Low |
| F13 zod `zod/v4` vs `zod` import split | TS/Consistency | P2 | Minor confusion | Mixed imports | Low |
| F14 `dist` not Node-ESM resolvable | Runtime/Portability | P2 | Node 24+ claim weak | Surprising import errors | Med |
| F15 `Burger` 957-line god object | Arch/Maint | P2 | Hard to modify | Large surface to learn | High |
| F16 Ecosystem plugins not installable (copied) | DX/Ecosystem | P2 | Manual file copying | Agent must copy files | Med |
| F17 "hooks" vs "plugins" terminology mix | Naming/Docs/AI-DX | P2 | Confusing categories | Mislabels auth as hooks | Low |
| F18 Uneven JSDoc on public surface | Docs | P3 | Some APIs undocumented | Less guidance | Low |
| F19 `RouteHooks.onRequest` should be excluded for routes | TS/API | P3 | Silent no-op | Compile error preferable | Low |
| F20 Route `config.ts` `auth:false` inert without auth plugin | DX/Docs | P3 | Misleading default | Agent assumes enforcement | Low |

### §19 Architectural Decisions (adopted)

- **Decision A (F2/F19)** — Remove route-level `onRequest` from `RouteHooks` type;
  fix `references/hooks.md`. Current implementation is global-only by design; a
  silent no-op is the worst outcome. **This is Phase 2 item 2 of the release plan.**
- **Decision B (F7)** — Officially support inline `schema/openapi/hooks/config` in
  `route.ts` as an alternative to file-based convention (code already merges/wins).
- **Decision C (F4)** — Stop scaffolding `maxPayloadLength`/`idleTimeout` in per-route
  WS `config.ts`; comment pointing to `burger.wsConfig()`.
- **Decision D (F3)** — Require file-based WS for prod parity; document the
  limitation + emit a build warning if programmatic WS/`wsConfig` are used without
  file equivalents.
- **Decision E (F1)** — Ship the AI skill from the same repo/version as the package;
  add a `minFrameworkVersion` check so an installed skill can't silently lag.

### §21 Suggested Implementation Order

1. F1 — stale installed skill + version check (highest AI-DX leverage).
2. F2/F19 — remove route-level `onRequest` + fix `references/hooks.md`.
3. F5/F6/F10 — doc/skill import paths, global-hooks location, `src/ws` naming.
4. F4 — stop scaffolding ignored WS transport keys.
5. F3 — document + warn on programmatic WS in prod builds.
6. F7/F8/F9 — inline-export policy, typed WS params, `RouteConfig.auth`.
7. F11–F17 — vestigial file, generated hook shape, zod import, `dist` ESM,
   `Burger` decomposition, plugin distribution, terminology.
8. F18/F20 — JSDoc sweep; clarify `config.auth` inertness without auth plugin.

---

## Harvested from `MANUAL_TEST_CHECKLIST.md` (deleted 2026-09-05)

### Phase 17 — npm publish pre-flight (do NOT skip) → now Phase 6 of the release plan

```bash
cd D:/Coding/BurgerAPI-work/burger-api/packages/burger-api && bun run build && npm pack --dry-run
cd D:/Coding/BurgerAPI-work/burger-api/packages/cli && bun run build && npm pack --dry-run
```
- [ ] 17.1 File list: `dist/`, `README.md`, `LICENSE`, `.d.ts` — no `src/` leaks, no secrets, no `.git`
- [ ] 17.2 `files` field includes exactly what's needed
- [ ] 17.3 `exports` map: `.`, `./validation`, `./compiler`, `./openapi`, `./ws`, `./adapter`, `./adapter/bun`, `./adapter/web-standard` all resolve
- [ ] 17.4 `engines`: `bun >= 1.3`, `node >= 24`
- [ ] 17.5 Only runtime dep is `zod ^4.0.17` — no `bun` import leaks into the web-standard entry
- [ ] 17.6 `bin` entry `burger-api` → `src/index.ts` resolves after build
- [ ] 17.7 Version consistency `1.0.0`: package.json, CHANGELOG, README badge, scaffold pin `^1.0.0`, ecosystem peer `>=1.0.0`
- [ ] 17.8 CI workflows exist and pass: `ci.yml`, `release-burger-api-npm.yml`, `release-cli-npm.yml`, `release-cli.yml`
- [ ] 17.9 CLI standalone executables build: `bun run build:win`, `build:linux`, `build:mac`, `build:mac-intel`
- [ ] 17.10 `npm publish --dry-run` succeeds for both packages (auth excluded)

### Phase 18 — Release execution order (manual, per PLAN-1.0 gate)

1. [ ] Final `bun run test:all` on a clean tree → 756 pass / 0 fail (baseline at time of writing; re-baseline after Phase 1/2 fixes land)
2. [ ] `git tag burger-api/v1.0.0` (and `cli/v1.0.0` if tagging CLI separately)
3. [ ] `git push origin feat/burger-api-v1` + push tags
4. [ ] `npm publish` for `packages/burger-api` (`burger-api@1.0.0`) — **left for the user to run per this session's decision**
5. [ ] `npm publish` for `packages/cli` (`@burger-api/cli@1.0.0`) — **left for the user to run per this session's decision**
6. [ ] Verify installs from the npm registry in a fresh temp dir:
   ```bash
   npm i -g @burger-api/cli
   burger-api create verify-app --lang ts
   cd verify-app && bun install && bun run dev
   ```
7. [ ] Post-publish: merge `feat/burger-api-v1` → `main` (per repo convention)
8. [ ] Note in `docs/burger-api-stability/STATUS.md`: tick unchecked PLAN items A3 + B7 (already done in reality)

### ⚠️ Discrepancy flagged during 2026-09-05 verification

`MANUAL_TEST_CHECKLIST.md` Appendix B (session 2026-08-20) recorded: *"Hooks |
Response order confirmed **Global → Route → Plugin** (global merged into route
scope, global-first) — accepted as intended; vision line clarified in `AGENTS.md`"*.

This matches `AGENTS.md:67`'s current text ("Global → Route"), but **contradicts
the current code**: `src/chain/flattener.ts:17-20,117-129` builds
`SCOPE_ORDER_RESPONSE` as `Local(Route) → Global → Plugin → Framework` —
Route-first, not Global-first. Either the order changed after 2026-08-20 without
re-syncing `AGENTS.md`, or the original "confirmation" measured the wrong thing.
Treated as a live doc bug in Phase 2 item 1 / Phase 4 P1 — fixing `AGENTS.md`,
`docs/hooks/system.md:37`, and `docs/hooks/global.md:34` to match the code as it
exists now, not the 2026-08-20 note.

---

## Phase checkpoints

### Phase 0 — 2026-09-05

- Harvested `audit.md` §17/§19/§21 and `MANUAL_TEST_CHECKLIST.md` Phases 17/18 into
  this file (above).
- Verified via two Explore passes before acting on any audit claim — see inline
  corrections above and in the approved plan
  (`C:\Users\EC\.claude\plans\burgerapi-v1-0-0-release-audit-squishy-bentley.md`).
- Deleted: `elysiajs-2-code.txt`, root `docs/` (empty), 4 root `.md` files, 14 stale
  gitignored benchmark reports under `burger-api-benchmarks/reports/2026-07-*` and
  `reports/battle/2026-07-*`.
- Kept `skills-lock.json` (not re-verified this session; audit reported 54↔54).

### Phase 1 — 2026-09-05

- **JIT bug fixed**: `packages/burger-api/src/lifecycle/jit.ts:127` guard changed
  from `if (plan.validators)` to `if (plan.validators?.response)`, matching the
  interpreter (`executor.ts:59`). Confirmed via a new regression test
  (`test/lifecycle/jit.test.ts`, "regression: a body-only schema does not trigger
  response-clone/parse on the JIT path") that spies on `Response.prototype.clone`
  and asserts zero calls for a route with only a `body` schema.
- **Added differential JIT/interpreter parity tests** in
  `test/lifecycle/jit.test.ts`: response-validation enforce-mode rejection parity,
  `onError` nearest-first dispatch parity, auto-HEAD parity, 405+Allow parity —
  filling the gaps the release plan flagged (short-circuit and mapper-reversal
  cases were already covered by the pre-existing suite).
- Full framework suite: **760 pass / 0 fail** (up from the pre-session baseline of
  756, reflecting the WIP tests + the 4 new tests added here). `bun run typecheck`
  clean for both `burger-api` and `cli` packages.
- **Open finding (not fixed — belongs to Phase 3):** CLI's
  `test/e2e/scaffold-e2e.test.ts` ("create → dev boot → build → start, TypeScript")
  fails intermittently on the `bun run typecheck` step inside the generated
  project, exiting 134 (SIGABRT) instead of 0. Manually reproduced the same
  scaffold (`BURGER_API_SOURCE=<local path> burger-api create my-app --lang ts`)
  outside the test harness and ran `bun run typecheck` directly in the result —
  it passed cleanly (exit 0). This points to test-harness flakiness (likely
  Windows process/child-process interaction inside the same test file) rather
  than a real generated-project defect. Revisit in Phase 3's E2E pass; do not
  ship-block on it without reproducing again there.
- Committed the WIP (WinterCG env/executionCtx bindings, JIT hook compilation,
  regex dispatch engine, Node WS bridge) together with the JIT fix and new tests
  as one coherent commit.

*(Next: Phase 2 checkpoint — AGENTS.md ordering fix, route-level `onRequest`
removal, dead macro-`expand()` removal, WS legacy-wrapper doc note, ordering drift
test, Node ESM extension fix.)*
