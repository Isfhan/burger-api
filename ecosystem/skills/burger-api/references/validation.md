# Validation Reference

## Schema Location

Validation schemas live in `schema.ts` next to `route.ts` (or `schema.js` /
`schema.mjs`). Each HTTP method gets a named uppercase export, consistent with
`route.ts` and `openapi.ts`:

```typescript
// api/users/schema.ts
import { z } from 'zod';

export const GET = {
    query: z.object({ page: z.coerce.number().min(1).max(100) }),
};

export const POST = {
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Invalid email'),
    }),
    response: {
        '201': z.object({ id: z.number(), name: z.string(), email: z.string() }),
    },
};
```

Schemas are optional. A route without a `schema.ts` skips validation entirely.

## Supported Targets

| Target | Source | When |
|---|---|---|
| `params` | URL path segments (`[id]`) | Always |
| `query` | URL query string | Any request with a query |
| `body` | Request body | When the method has a body |
| `headers` | Request headers | Always |
| `cookies` | Cookie values | Always |
| `response` | Handler response (per status code) | Optional, mode-gated |

## Accessing Validated Data

Validated data is available on `ctx.validated`, fully typed from the route's
`schema.ts` via `BurgerContext<typeof GET>` (the `InferValidated` type helper):

```typescript
// route.ts
import type { BurgerContext } from 'burger-api';
import type { GET, POST } from './schema';

export async function POST(ctx: BurgerContext<typeof POST>) {
    const body = ctx.validated.body;  // { name: string, email: string }
    return Response.json(body, { status: 201 });
}

export async function GET(ctx: BurgerContext<typeof GET>) {
    // ctx.validated.params is the typed params channel (schema-typed path
    // parameters); raw ctx.params stays a runtime string record.
    const page = ctx.validated.query?.page;
    return Response.json({ page });
}
```

Invalid slots (e.g. `ctx.validated.unknown`) fail at compile time; slots
without a schema are `unknown`.

## Sharing Schemas Across Routes

Define a shape once in its own file and import it into route schemas. Plain
TypeScript, fully typed, no registry:

```typescript
// src/schemas.ts
import { z } from 'zod';

export const Pagination = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
});
```

```typescript
// api/items/schema.ts
import { Pagination } from '../../schemas';

export const GET = { query: Pagination };
```

## Automatic Type Conversion (Coercion)

Enable app-wide coercion so string query/params become numbers and booleans
without repeating `z.coerce.*`:

```typescript
// src/index.ts
const burger = new Burger({
    apiDir: './src/api',
    validation: { coerce: true },
});
```

Or per route method:

```typescript
// api/items/schema.ts
export const GET = {
    coerce: true,
    query: z.object({ n: z.number(), b: z.boolean() }),
};
// ?n=42&b=true  =>  { n: 42, b: true }
```

## Response Validation

Declare what a handler returns and BurgerAPI checks it. Modes:
`off` | `dev` (default) | `enforce`. Configurable globally
(`validation.responseValidation`) and per route:

```typescript
// api/users/schema.ts
export const GET = {
    response: { 200: z.object({ ok: z.boolean() }) },
};
```

## Standard Schema Support

Any Standard Schema library (Zod v4, Valibot, ArkType, Effect Schema) works
through the same `schema.ts` exports. Zod is the default. Sync validation only.

## Error Handling

Validation failures throw `ValidationError` → 422 Unprocessable Entity:

```json
{
    "type": "https://httpwg.org/specs/rfc9457.html#status.422",
    "title": "Unprocessable Entity",
    "status": 422,
    "errors": {
        "body": [{ "message": "Name is required" }],
        "query": [{ "message": "Page must be >= 1" }]
    }
}
```

Errors follow the RFC 9457 Problem Details format. Control the shape with
`validation.errorFormat` (`plain` or `problem+json`, default `problem+json`);
production bodies never leak stacks or schema internals. Catch and customize in
an `onError` hook.

## Common Zod Patterns

```typescript
// Automatic type conversion (also called coercion): turn strings into numbers, e.g. "42" → 42 (for query params)
z.coerce.number().min(1)

// Optional fields
z.string().optional()

// Default values
z.coerce.number().default(10)

// String validation
z.string().email()
z.string().min(3).max(100)
z.string().regex(/^[a-z]+$/)

// Number validation
z.number().positive().int()
z.number().min(0).max(100)

// Arrays
z.array(z.string())
z.array(z.object({ id: z.string() }))

// Union types
z.union([z.literal('active'), z.literal('inactive')])
```
