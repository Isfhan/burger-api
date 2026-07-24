# Zod v4 Validation Reference

## Schema Structure

A schema is a small description of the expected data shape. Schemas are defined
per HTTP method (lowercase) and per target:

```typescript
export const schema = {
    get: {
        params: z.object({ id: z.string() }),
        query: z.object({ page: z.coerce.number().min(1).max(100) }),
    },
    post: {
        params: z.object({ id: z.string() }),
        body: z.object({
            name: z.string().min(1, 'Name is required'),
            email: z.string().email('Invalid email'),
        }),
    },
    put: {
        params: z.object({ id: z.string() }),
        body: z.object({
            name: z.string().optional(),
            email: z.string().email().optional(),
        }),
    },
    delete: {
        params: z.object({ id: z.string() }),
    },
};
```

## Supported Targets

| Target | Source | When |
|---|---|---|
| `params` | URL path segments | Always |
| `query` | URL query string | GET requests |
| `body` | Request body | POST, PUT, PATCH |
| `headers` | Request headers | Always |
| `cookie` | Cookie values | Always |

## Accessing Validated Data

```typescript
export async function POST(ctx: BurgerContext) {
    const params = ctx.validated?.params;  // { id: string }
    const body = ctx.validated?.body;       // { name: string, email: string }
    // `params` and `body` are fully typed based on the Zod schema
    return Response.json(body, { status: 201 });
}
```

## Model Registry

Define a shape once and reuse it by name from any route:

```typescript
// burger.config.ts
export default {
    models: {
        Pagination: z.object({
            page: z.number().min(1).default(1),
            limit: z.number().min(1).max(100).default(20),
        }),
    },
};
```

```typescript
// api/items/route.ts
export const schema = {
    get: { query: "Pagination" },
};
```

## Automatic Type Conversion (Coercion)

Coerce strings into numbers/booleans app-wide instead of repeating `z.coerce.*`:

```typescript
// burger.config.ts
export default {
    validation: { coerce: true },
};
```

```typescript
export const schema = {
    get: { query: z.object({ n: z.number(), b: z.boolean() }) },
};
// ?n=42&b=true  =>  { n: 42, b: true }
```

## Response Validation

Declare what a handler returns and have BurgerAPI check it
(`off` | `dev` | `enforce`):

```typescript
export const schema = {
    get: {
        response: { 200: z.object({ ok: z.boolean() }) },
    },
};
```

## Standard Schema Support

Any Standard Schema library (Zod v4, Valibot, ArkType) works through the same
`schema` export. Zod remains the default.

## Error Handling

Validation failures return 400 automatically:

```json
{
    "errors": {
        "body": [{ "message": "Name is required" }],
        "query": [{ "message": "Page must be >= 1" }]
    }
}
```

The response includes field-level error messages for each failed target.

Errors follow the RFC 9457 Problem Details format. Control the shape with
`validation.errorFormat` (`plain` or `problem+json`); production bodies never
leak stacks or schema internals. Supply `validation.errorRenderer` for full
control.

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
