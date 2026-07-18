# OpenAPI & Swagger UI Reference

## Automatic Endpoints

Every BurgerAPI server automatically serves:
- `GET /openapi.json` — OpenAPI 3.0 specification (JSON)
- `GET /docs` — Interactive Swagger UI (HTML)

These require no configuration — they work out of the box.

## Route Metadata

Customize the generated OpenAPI spec by exporting `openapi` from your `route.ts`:

```typescript
export const openapi = {
    get: {
        summary: 'List all users',
        description: 'Returns a paginated list of users with their profiles',
        tags: ['Users'],
        operationId: 'listUsers',
        deprecated: false,
        externalDocs: {
            description: 'User management guide',
            url: 'https://docs.example.com/users',
        },
        responses: {
            '200': { description: 'List of users' },
            '400': { description: 'Invalid page parameter' },
        },
    },
};
```

The `operationId` should be unique across all routes. Tags group related endpoints in the Swagger UI.

## Server Options

Global OpenAPI metadata is set in the Burger constructor:

```typescript
const app = new Burger({
    apiDir: './api',
    apiPrefix: '/api',
    title: 'My API',
    description: 'API description for documentation',
    version: '1.0.0',
});
```

## Schema Conversion

A schema is a small description of the expected data shape. Zod v4 schemas defined in `schema` exports are automatically converted to OpenAPI 3.0 schema objects. This includes:
- String types (minLength, maxLength, pattern)
- Number types (minimum, maximum)
- Arrays (items schema)
- Objects (properties, required)
- Enums
- Optional fields
- Default values

## Swagger UI

The Swagger UI at `/docs` is a full-featured interactive documentation interface where users can:
- Browse all endpoints by tag
- View request/response schemas
- Test endpoints directly from the browser
- Download the OpenAPI JSON
