# AGENTS.md — BurgerAPI Project Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Project Overview

BurgerAPI is a **Bun-first, compiler-driven, file-based** API framework. It is **Bun-first** (Bun is the primary and best-supported runtime) and runs on other WinterCG runtimes (Node, Deno, Workers, Edge) through a thin **adapter seam** that speaks Web Standard `Request`/`Response`. Built by Isfhan Ahmed, it provides file-based routing where a route is a *directory* of sibling files. The request lifecycle runs through a **middleware pipeline** (`ServerOptions.globalMiddleware` + a route's `middleware` array); a `middleware.ts` route-file convention is rejected (middleware is registered as functions, not discovered as a route file). The compiler also discovers and carries `hooks.ts`, `use.ts`, and `webhook.ts` convention files, but in v0.14.0 these are **reserved** (not yet executed at runtime). It also provides Zod v4 / Standard Schema validation, automatic OpenAPI 3.0 generation, Swagger UI, and first-class webhooks (webhooks reserved).

**Tech:** Bun >= 1.3.0, TypeScript (ESM), Zod ^4.0.17
**Packages:** `burger-api` (core framework), `@burger-api/cli` (CLI tool)
**Ecosystem:** Production-ready middleware in `ecosystem/middlewares/`
**Status:** Pre-1.0 (v0.14.0), active development, under a pre-1.0.0 architecture reset (see `../ROADMAP.md`)
**Homepage:** https://burger-api.com

## Essential Commands

```bash
bun install              # Install all workspace dependencies
bun run typecheck        # Typecheck the burger-api framework
bun run test:all         # Full test suite (framework + CLI + typecheck)
bun run test:framework   # Framework tests only
bun run build            # Build burger-api framework
bun run dev              # Run burger-api dev server
bun test                 # Run tests in current package
```

## Architecture

- `packages/burger-api/` — Core framework (`Burger` class, `ApiRouter`, `PageRouter`, the compiler that discovers/merges route files, the middleware request flow (also called a pipeline), OpenAPI generator, Swagger UI, adapter seam)
- `packages/cli/` — CLI tool (create, add, build, build:exec, serve)
- `ecosystem/middlewares/` — 10 production-ready middleware (CORS, Rate Limiter, Logger, JWT Auth, etc.)
- **Compiler as the heart**: discovers route directories and merges their sibling files (`route.ts`, `schema.ts`, `openapi.ts`, plus the reserved `hooks.ts` / `use.ts` / `webhook.ts`) plus group inheritance into an immutable `CompiledRoute[]` at compile time. A `middleware.ts` route file is rejected; middleware is registered as functions, not discovered as a route file.
- Uses **Bun's native `routes` API** for static route dispatch (not a catch-all fetch handler)
- **Trie-based router** (a trie is a tree structure for fast path matching) with 3-tier priority: static > dynamic (`:param`) > wildcard (`*`)
- **Route discovery prepared ahead of time (AOT)** in production builds: the CLI compiles routes when the app is built, so there is no filesystem access when a request comes in

## Related Repositories

BurgerAPI is split across several repositories. Do not invent work in the wrong
repo — use the dedicated one:

- **`burger-api`** (this repo) — the framework + CLI. The only place for
  framework code, types, examples, and docs about the API itself.
- **`burger-api-website`** — the Docusaurus documentation site and blog
  (`https://burger-api.com`). All user-facing docs and release posts live here.
- **`burger-api-benchmarks`** — the **dedicated, official home for all BurgerAPI
  performance benchmarks** (`https://github.com/isfhan/burger-api-benchmarks`).

  **Do not create a `bench`, `benchmark`, or similar folder inside this
  (`burger-api`) repository.** Agents often assume benchmark code belongs next to
  the framework because they don't know the separate repo exists. It does not —
  all benchmark scenarios, engines, and reporters must be added to
  `burger-api-benchmarks` (see its `AGENTS.md` Rule 8b). The framework ships no
  benchmark implementation and no generated numbers.

## Rule 1 — Think Before Coding

State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists. Stop when confused. Name what's unclear.

## Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 — Surgical Changes

Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

## Rule 5 — Use the Model Only for Judgment Calls

Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, predictable (deterministic) transforms — where the same input always gives the same result.
If code can answer, code answers.

## Rule 6 — Read Before You Write

Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.
Key files to read first: `packages/burger-api/src/index.ts`, `core/api-router.ts`, `types/index.ts`.

## Rule 7 — Surface Conflicts, Don't Average Them

If two patterns contradict, pick one (more recent / more tested). Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 8 — Tests Verify Intent, Not Just Behavior

Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.
When changing route/path logic, run `bun run test:route-sync` from root.

## Rule 9 — Checkpoint After Every Significant Step

Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 10 — Match the Codebase's Conventions, Even If You Disagree

Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 11 — Fail Loud

"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

## Rule 12 — Bun First (not Bun-only)

Bun is the **primary and best-supported** runtime. Prefer `Bun.serve`, `Bun.write`, `Bun.file`, `Bun.spawn` over Node alternatives, and `bun add` (not npm/yarn/pnpm). However, BurgerAPI is **not Bun-exclusive**: the core speaks Web Standard `Request`/`Response`, and other WinterCG runtimes (Node, Deno, Workers, Edge) are supported through a thin adapter seam. Do not introduce **runtime** APIs that block non-Bun runtimes in the framework core unless they are isolated behind the adapter seam. (The pre-1.0 reset explicitly does **not** guarantee backward compatibility — see `../ROADMAP.md`.)

## Code Conventions

### File Naming & Routing
A route is a **directory**; the compiler discovers sibling files and merges them. The convention is separation-of-concerns-by-file:

- `route.ts` — HTTP method handlers only (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`)
- `schema.ts` — validation schemas only (Zod v4 / Standard Schema)
- `openapi.ts` — OpenAPI documentation metadata only
- `hooks.ts` — **reserved**: lifecycle hook definitions (`beforeHandle`, `afterHandle`, `onError`, `onResponse`, `provide`). Discovered and carried by the compiler, but **not executed in v0.14.0**.
- `use.ts` — **reserved**: capabilities/plugins. Discovered and carried, but not executed in v0.14.0.
- `webhook.ts` — **reserved**: webhook definitions (incoming/outgoing, signature verification, retry). Discovered and carried, but not executed in v0.14.0.
- Dynamic routes: `[paramName]/route.ts` — access via `req.params.paramName`
- Wildcard routes: `[...]/route.ts` — access via `req.wildcardParams`
- Route groups: `(groupName)/route.ts` — doesn't affect URL path; group `schema.ts`/`openapi.ts`/`hooks.ts`/`use.ts` are inherited (nearest-last, deterministic). A `middleware.ts` route file is rejected; middleware is registered as functions via `globalMiddleware` / route `middleware`.

### Route Template
```typescript
// api/users/route.ts — handlers only
export async function GET(req: BurgerRequest) { return Response.json(data); }

// api/users/schema.ts — validation only
export const get = { query: z.object({ search: z.string() }) };
export const post = { body: z.object({ name: z.string().min(1), price: z.number().positive() }) };

// api/users/hooks.ts — reserved: lifecycle hooks (carried, not executed in v0.14.0)
export const beforeHandle = (req) => { /* auth, logging, CORS as hooks */ };
export const provide = { user: (req) => getCurrentUser(req) };

// api/users/openapi.ts — docs only
export const get = { summary: '...', tags: ['users'], operationId: '...' };
```

### Request Lifecycle: the Middleware Pipeline
The request lifecycle runs through a single pipeline: `ServerOptions.globalMiddleware` followed by a route's `middleware` array. A middleware can stop the request early by returning a `Response`, transform the final response by returning a function, or continue by returning `undefined`. Validation runs as a middleware; `405`/`Allow`, auto-`HEAD`, and loose trailing-slash are compiled into the runtime. The `hooks.ts` / `use.ts` / `webhook.ts` data is carried on the `RouteModule` but is **not executed in v0.14.0** (reserved for later releases).

Middleware return types (`BurgerNext`):
- `Response` — stop early and skip the rest of the chain (short-circuit)
- `Function` (takes Response, returns a Promise<Response>) — transform the response after the handler runs (applied in reverse order)
- `undefined` — continue to the next middleware/handler

### Reserved: Hooks / Use / Webhooks (not yet executed)
`hooks.ts` defines lifecycle hooks (`beforeHandle`, `afterHandle`, `onError`, `onResponse`, `provide`), and `use.ts` declares capabilities/plugins (e.g. `jwt()`, `swagger()`, `cors()`, `rateLimit()`); `provide` is intended to replace `derive`/`mapDerive`. These are discovered and carried by the compiler but are **reserved** in v0.14.0: they do not run yet. Do not document them as working v0.14.0 features.

### Types
- `BurgerRequest<T>` — typed requests with validation (interface; `BurgerContext` is the implementation)
- `RequestHandler` — route handlers
- `Middleware` — lifecycle functions registered via `globalMiddleware` / route `middleware`
- `BurgerNext` — middleware return types (Response | (r: Response) => Promise<Response> | undefined)
- `Hook` — reserved lifecycle hook functions (from `hooks.ts`)
- `ProvideContribution` — reserved context values added by `provide`
- `Plugin` — reserved capability/plugin type (from `use.ts`)

### Import Style
```typescript
import { Server } from '@core/server.js';
import { ApiRouter } from '@core/api-router.js';
import type { ServerOptions, Middleware, BurgerNext } from '@burgerTypes';
```

## Performance

- Pre-allocated middleware arrays (fast paths for 0, 1, 2, 3+ middlewares)
- Manual loop unrolling for common cases
- Bun's native `routes` API for static dispatch
- Route discovery prepared ahead of time in production builds (no filesystem scanning when a request comes in)
- Trie-based matching (fast tree-based path lookup) with priority ordering
