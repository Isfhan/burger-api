# Zod v4 Validation Reference

## Schema Structure

Schemas are defined per HTTP method (lowercase) and per target:

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

## Accessing Validated Data

```typescript
export async function POST(req: BurgerRequest) {
    const params = req.validated?.params;  // { id: string }
    const body = req.validated?.body;       // { name: string, email: string }
    // `params` and `body` are fully typed based on the Zod schema
    return Response.json(body, { status: 201 });
}
```

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

## Common Zod Patterns

```typescript
// Coerce strings to numbers (for query params)
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
