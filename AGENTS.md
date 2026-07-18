# AGENTS.md — BurgerAPI Project Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Project Overview

BurgerAPI is a **Bun.js-exclusive** API framework — it only works with Bun.js and cannot run on Node.js/Deno. Built by Isfhan Ahmed, it provides file-based routing, a middleware architecture (middleware is code that runs around your handler), Zod v4 validation, automatic OpenAPI 3.0 generation, and Swagger UI.

**Tech:** Bun >= 1.3.0, TypeScript (ESM), Zod ^4.0.17
**Packages:** `burger-api` (core framework), `@burger-api/cli` (CLI tool)
**Ecosystem:** Production-ready middleware in `ecosystem/middlewares/`
**Status:** Pre-1.0 (v0.12.0), active development
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

- `packages/burger-api/` — Core framework (`Burger` class, `ApiRouter`, `PageRouter`, the middleware request flow (also called a pipeline), OpenAPI generator, Swagger UI)
- `packages/cli/` — CLI tool (create, add, build, build:exec, serve)
- `ecosystem/middlewares/` — 10 production-ready middleware (CORS, Rate Limiter, Logger, JWT Auth, etc.)
- Uses **Bun's native `routes` API** for static route dispatch (not a catch-all fetch handler)
- **Trie-based router** (a trie is a tree structure for fast path matching) with 3-tier priority: static > dynamic (`:param`) > wildcard (`*`)
- **Route discovery prepared ahead of time (AOT)** in production builds — the CLI scans routes when the app is built, so there is no filesystem access when a request comes in

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

## Rule 12 — Bun First

Everything is built exclusively for Bun.js. Never introduce Node.js dependencies or Node-specific APIs.
Use `Bun.serve`, `Bun.write`, `Bun.file`, `Bun.spawn` over Node alternatives.
Package management: `bun add`, not npm/yarn/pnpm.

## Code Conventions

### File Naming & Routing
- API routes: `route.ts` — exported HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`)
- Dynamic routes: `[paramName]/route.ts` — access via `req.params.paramName`
- Wildcard routes: `[...]/route.ts` — access via `req.wildcardParams`
- Route groups: `(groupName)/route.ts` — doesn't affect URL path
- Static pages: `.tsx` or `.html` in page directory

### Route Template
```typescript
// OpenAPI Metadata
export const openapi = { get: { summary: '...', tags: ['...'], operationId: '...' } };

// Validation Schemas (Zod v4)
export const schema = { get: { query: z.object({ ... }) }, post: { body: z.object({ ... }) } };

// Route-Specific Middleware
export const middleware: Middleware[] = [ ... ];

// HTTP Method Handlers
export async function GET(req: BurgerRequest) { return Response.json(data); }
```

### Middleware System
Each middleware can return one of three things:
- `Response` — stop early and skip the rest of the chain (short-circuit)
- `Function` (takes Response, returns Response) — transform the response after the handler runs
- `undefined` — continue to the next middleware/handler

After-middlewares (the ones that transform the response) run in reverse order, even when a middleware stops the chain early.

### Types
- `BurgerRequest<T>` — typed requests with validation
- `RequestHandler` — route handlers
- `Middleware` — middleware functions
- `BurgerNext` — middleware return types (Response | (r: Response) => Response | undefined)

### Import Style
```typescript
import { Server } from '@core/server.js';
import { ApiRouter } from '@core/api-router.js';
import type { ServerOptions, Middleware } from '@burgerTypes';
```

## Performance

- Pre-allocated middleware arrays (fast paths for 0, 1, 2, 3+ middleware)
- Manual loop unrolling for common cases
- Bun's native `routes` API for static dispatch
- Route discovery prepared ahead of time (AOT) in production (no filesystem scanning when a request comes in)
- Trie-based matching (fast tree-based path lookup) with priority ordering
