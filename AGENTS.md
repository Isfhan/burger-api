# AGENTS.md — BurgerAPI Project Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Source of truth

**Architecture and product decisions live in:**

`../burger-api-roadmaps/BURGERAPI_VISION.md`

When code, docs, or this file disagree with the vision, **the vision wins**.  
Do not invent architecture. If unclear, stop and ask.

Also see: `../burger-api-roadmaps/ARCHITECTURE.md`, `../burger-api-roadmaps/ROADMAP.md`.

---

## Project Overview

BurgerAPI is a **Bun-first**, WinterCG-compatible, **file-based** TypeScript API framework: file-based routing, end-to-end type safety, hook-based request lifecycle, small core + rich ecosystem.

**Tech:** Bun >= 1.3.0 (primary), Node 24+ / edge where practical · TypeScript ESM · Zod ^4 / Standard Schema  
**Packages:** `burger-api`, `@burger-api/cli`  
**Status:** Pre-1.0 — vision locked; implementation may still use legacy names until migrated  
**Homepage:** https://burger-api.com

### Target public architecture (vision)

**App files:**

```
src/index.ts
src/plugins.ts      # burger.usePlugin(...)
src/providers.ts    # burger.provide(name, service) → ctx.services
src/hooks.ts        # global hooks (all 6 points)
src/api/**/         # routes
burger.build.ts     # build-time only (CLI) — not runtime config
```

**Route convention files (first-class, no inheritance):**

| File | Role |
|------|------|
| `route.ts` | Handlers: `export async function GET(ctx: BurgerContext)` |
| `schema.ts` | Per-method named exports: `export const GET = { body, query, ... }` |
| `hooks.ts` | Route hooks only for that route |
| `openapi.ts` | Per-method OpenAPI metadata |
| `config.ts` | Route options: auth, cache, timeout, … |

Per-method named exports (`GET`, `POST`, …) replace lowercase method objects in route/schema/openapi.

**Hooks (lifecycle) vs plugins (extensions):**

- **Hooks** control request execution: `onRequest`, `transform`, `beforeRoute`, `afterRoute`, `mapResponse`, `onError`
- **Plugins** extend the app (may register hooks, providers, context types)

They are separate. Do not describe plugins as “middleware replacement.”

**Lifecycle:**

```
onRequest → Routing → transform → Validation → beforeRoute
  → Handler → afterRoute → mapResponse
```

Error → `onError`. Scopes: Framework → Plugin → Global → Route (response/error reversed).

**Context:** public type **`BurgerContext`**. Standard Web **`Response`** only.  
**Validation:** throw `ValidationError` → onError → default 422 + RFC 9457.  
**Ecosystem:**

```
ecosystem/hooks/     # request lifecycle factories (cors, logger, …)
ecosystem/plugins/   # app integrations (jwt, session, env, …)
ecosystem/skills/    # AI skills
```

**Auth:** ecosystem plugins under `ecosystem/plugins/`, integrating with hooks + `config.ts`. Core is auth-agnostic.

**Not planned:** group/folder inheritance, route `use.ts` / `webhook.ts`, ORM, dedicated webhook router.  
**Planned later:** file-based WebSocket router under `src/websocket/`.

### Legacy code (removed in Phase 2)

The following have been removed: `BurgerRequest`, `Middleware` type, `beforeHandle`/`afterHandle`/`onResponse`/`provide`, group inheritance, `burger.config.ts`, `use.ts`/`webhook.ts` discovery. All public API now uses `BurgerContext`, hooks (`beforeRoute`/`afterRoute`/`mapResponse`/`transform`/`onRequest`/`onError`), and plugins.

---

## Essential Commands

```bash
bun install
bun run typecheck
bun run test:all
bun run test:framework
bun run build
bun run dev
bun test
```

## Architecture (code layout)

- `packages/burger-api/` — core (`Burger`, compiler, router, lifecycle, OpenAPI, adapters). Live discovery: `compiler/scanner.ts` + `compiler/module-loader.ts`. Do not build on legacy `core/api-router.ts`.
- `packages/cli/` — create, add, build, serve (migrate toward vision: `dev`/`start`/`generate`/`inspect`/`doctor`, `burger.build.ts`)
- `ecosystem/hooks/` — official lifecycle hooks
- `ecosystem/plugins/` — official plugins (add as they land)
- Hybrid router: Bun static routes + trie (static > `:param` > `*`)
- AOT route discovery in production builds

## Related Repositories

- **`burger-api`** (this repo) — framework + CLI
- **`burger-api-website`** — docs site
- **`burger-api-benchmarks`** — **only** place for benchmarks (never add `bench/` here)
- **`burger-api-roadmaps`** — vision, architecture, roadmaps

## Rule 1 — Think Before Coding

State assumptions. If uncertain, ask. Push back on overengineering. Stop when confused.

## Rule 2 — Simplicity First

Minimum code. No speculative features. No single-use abstractions.

## Rule 3 — Surgical Changes

Touch only what you must. Match existing style in local code; match **vision** for public API/docs.

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.

## Rule 5 — Use the Model Only for Judgment Calls

Prefer code for deterministic transforms.

## Rule 6 — Read Before You Write

Read exports, callers, utilities first. Key files: `packages/burger-api/src/index.ts`, `compiler/*`, `router/*`, `lifecycle/*`, `types/index.ts`.

## Rule 7 — Surface Conflicts, Don't Average Them

If patterns contradict, pick vision for product API; pick tested code for local style. Flag debt.

## Rule 8 — Tests Verify Intent

When changing route/path logic, run `bun run test:route-sync`.

## Rule 9 — Checkpoint After Significant Steps

Summarize done / verified / left.

## Rule 10 — Match Conventions

Inside codebase: local style. For user-facing API and docs: vision terminology.

## Rule 11 — Fail Loud

Do not claim done if skipped silently.

## Rule 12 — Bun First (not Bun-only)

Prefer Bun APIs. Core stays WinterCG-portable behind adapters. Node 24+ / edge supported where practical.

## Rule 13 — Vision Wins

Do not reintroduce: middleware layer/type, group inheritance, lowercase schema method objects as the primary pattern, `BurgerRequest` as a public type, lifecycle hook named `provide`, route-level `use.ts` as the plugin system, first-class `webhook.ts`.

## Code Conventions (target)

### Routing

- Dynamic: `[paramName]` → `ctx.params`
- Wildcard: `[...]` → `ctx.wildcardParams`
- Groups: `(name)` — URL only, **no file inheritance**

### Route template

```typescript
// route.ts
export async function GET(ctx: BurgerContext): Promise<Response> {
  return Response.json({ ok: true });
}

// schema.ts
export const GET = { query: z.object({ q: z.string().optional() }) };
export const POST = { body: z.object({ name: z.string() }) };

// openapi.ts
export const GET = { summary: "...", tags: ["users"] };

// config.ts
export default { auth: false };

// hooks.ts
export const beforeRoute = async (ctx: BurgerContext) => { /* ... */ };
```

### Types (target)

- `BurgerContext` — public request lifecycle object
- Hook point names per vision
- `HTTPError` / `ValidationError` / … error classes

### Imports (user projects)

```typescript
import { Burger } from "burger-api";
import type { BurgerContext } from "burger-api";
```

## Performance

AOT routes, static dispatch, efficient hook plans, small footprint. Benchmarks only in `burger-api-benchmarks`.
