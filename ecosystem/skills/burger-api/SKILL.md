---
name: burger-api
description: Build APIs with BurgerAPI, a Bun-native framework with file-based routing, Zod v4 validation, middleware system, and automatic OpenAPI generation. Use when creating API routes, adding validation, configuring middleware, or building/deploying a BurgerAPI project.
---

# BurgerAPI Development Skill

Always consult [burger-api.com/docs](https://burger-api.com/docs) for the latest API reference and guides.

## Overview

BurgerAPI is a Bun.js-exclusive API framework with file-based routing, a middleware pipeline, Zod v4 validation, and automatic OpenAPI 3.0 + Swagger UI. Built by Isfhan Ahmed.

**Requirements:** Bun >= 1.3.0, TypeScript (ESM)

## Quick Start

```typescript
import { Burger } from 'burger-api';

const app = new Burger({
    apiDir: './api',
    apiPrefix: '/api',
    globalMiddleware: [],
    title: 'My API',
    version: '1.0.0',
});

await app.serve(4000);
```

## File-Based Routing

Routes are discovered from the filesystem at runtime (dev) or embedded at build time (production).

### Route File Structure

```
api/
├── route.ts              → GET /api
├── users/
│   ├── route.ts          → GET /api/users
│   └── [id]/
│       └── route.ts      → GET /api/users/:id
└── files/
    └── [...]
        └── route.ts      → GET /api/files/*
```

### Route File Exports

Each `route.ts` exports optional metadata, validation schemas, middleware, and HTTP method handlers:

```typescript
import { z } from 'zod';
import type { BurgerRequest, Middleware } from 'burger-api';

// OpenAPI metadata (optional)
export const openapi = {
    get: { summary: 'List items', tags: ['Items'], operationId: 'listItems' },
};

// Zod v4 validation schemas (optional, per-method)
export const schema = {
    get: { query: z.object({ page: z.coerce.number().default(1) }) },
    post: { body: z.object({ name: z.string().min(1) }) },
};

// Route-specific middleware (optional)
export const middleware: Middleware[] = [
    async (req) => { console.log(req.method, req.url); return undefined; },
];

// HTTP method handlers
export async function GET(req: BurgerRequest) {
    return Response.json({ message: 'Hello' });
}
export async function POST(req: BurgerRequest) {
    const body = req.validated?.body;
    return Response.json(body, { status: 201 });
}
```

### Routing Patterns

| Pattern | Syntax | Example URL | Access |
|---|---|---|---|
| Static | `route.ts` | `/api/users` | — |
| Dynamic | `[id]/route.ts` | `/api/users/42` | `req.params.id` |
| Wildcard | `[...]/route.ts` | `/api/files/a/b/c` | `req.wildcardParams` |
| Group | `(admin)/route.ts` | `/api/users` (group ignored) | — |
| Nested dynamic+wildcard | `[userId]/[...]/route.ts` | `/api/users/42/files/a` | `req.params.userId`, `req.wildcardParams` |

Rules:
- Do not mix `[...]` and `[id]` at the same directory level.
- Do not create multiple dynamic folders (e.g., `[id]` and `[slug]`) in the same level.
- Groups `(name)` are ignored in URL paths (for organization only).

### OpenAPI Metadata

```typescript
export const openapi = {
    get: {
        summary: 'Short description',
        description: 'Longer description',
        tags: ['Category'],
        operationId: 'uniqueId',
        deprecated: false,
        responses: {
            '200': { description: 'Success' },
            '400': { description: 'Bad Request' },
        },
    },
};
```

## Zod v4 Validation

Schemas are defined per HTTP method, per validation target:

```typescript
export const schema = {
    get: {
        params: z.object({ id: z.string() }),
        query: z.object({ page: z.coerce.number().min(1) }),
    },
    post: {
        body: z.object({ name: z.string().min(1), email: z.string().email() }),
    },
};
```

Access validated data via `req.validated.params`, `req.validated.query`, `req.validated.body`.

Validation errors return 400 with structured error details automatically.

## Middleware System

Three return types:
- **`undefined`** — continue to next middleware/handler
- **`Response`** — short-circuit and send immediately
- **`Function`** `(response: Response) => Response` — transform the final response after the handler runs

After-middlewares (function return type) run in reverse order, even when a previous middleware short-circuits.

### Global Middleware

```typescript
const app = new Burger({
    globalMiddleware: [logger(), cors({ origin: '*' })],
});
```

### Route-Specific Middleware

```typescript
export const middleware: Middleware[] = [
    async (req) => {
        const token = req.headers.get('Authorization');
        if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        return undefined;
    },
    async (req) => {
        // After-middleware: transforms response
        return (response: Response) => {
            response.headers.set('X-Custom', 'value');
            return response;
        };
    },
];
```

## OpenAPI & Swagger UI

Automatic at no extra cost:
- `GET /openapi.json` — OpenAPI 3.0 specification
- `GET /docs` — Interactive Swagger UI

## CLI Commands

```bash
burger-api create <name>           # Scaffold new project
burger-api add <middleware...>     # Add ecosystem middleware
burger-api skills install [name]   # Install AI agent skills
burger-api skills list             # List installed skills
burger-api skills available        # List skills available on GitHub
burger-api list                    # List available middleware
burger-api serve                   # Dev server with hot reload
burger-api build <file>            # Bundle for production (AOT routing)
burger-api build:exec <file>       # Compile to standalone executable
```

## Essential Commands

```bash
bun install              # Install dependencies
bun run typecheck        # Typecheck the framework
bun run test:all         # Full test suite
bun run build            # Build framework
bun run dev              # Dev server
bun test                 # Run tests in current package
```

## Architecture

- **`Burger` class** — main entry point, orchestrates server, routers, middleware pipeline
- **`ApiRouter`** — trie-based, filesystem-scanned, 3-tier priority (static > dynamic > wildcard)
- **`PageRouter`** — serves HTML pages (`.tsx` or `.html`) from a page directory
- **Middleware pipeline** — optimized fast paths for 0, 1, 2, 3+ middleware
- **OpenAPI generator** — converts Zod schemas + route metadata to OpenAPI 3.0

## References

See the `references/` directory for detailed documentation:
- `routing.md` — File-based routing patterns and examples
- `validation.md` — Zod v4 validation details
- `middleware.md` — Middleware system deep dive
- `cli.md` — CLI command reference
- `openapi.md` — OpenAPI & Swagger UI configuration
