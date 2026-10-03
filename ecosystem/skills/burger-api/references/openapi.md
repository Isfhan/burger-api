# OpenAPI Reference

## Configuration

OpenAPI is configured via `openapi.config.ts`, an auto-discovered convention file that lives next to the entry point (`src/openapi.config.ts` when `src/` exists, or root for flat structures).

```ts
// src/openapi.config.ts
import { z } from "zod";

export default {
  title: "My API",
  description: "API description for documentation",
  version: "1.0.0",
  servers: [{ url: "https://api.example.com", description: "Production" }],
  contact: { name: "Team", email: "api@example.com" },
  license: { name: "MIT" },
  path: "/openapi.json",
  docsPath: "/docs",
  enabled: true,
  docsAuth: { username: "admin", password: process.env.DOCS_PASSWORD },
  mapJsonSchema: { zod: z.toJSONSchema },
} satisfies import("burger-api").OpenAPIConfig;
```

When `openapi.config.ts` does not exist, defaults apply: minimal metadata, `/openapi.json` and `/docs` endpoints, Swagger UI docs, no docs protection.

## Endpoints

| Endpoint | Purpose | Default |
|----------|---------|---------|
| `GET /openapi.json` | OpenAPI 3.1 specification (JSON) | Always served (configurable path) |
| `GET /docs` | Documentation UI | Enabled, configurable path |

Paths are configurable via `openapi.config.ts`. Both endpoints are disabled with `enabled: false`.

## Docs UI

Default: **Swagger UI** via CDN: classic, widely familiar, searchable endpoints.

Built-in alternatives:

```ts
import { scalarDocs, swaggerDocs, redocDocs } from "burger-api";

export default {
  provider: swaggerDocs(),    // default: classic Swagger UI
  // provider: scalarDocs(),  // modern Scalar UI with dark mode
  // provider: redocDocs(),   // clean three-panel docs
};
```

Custom providers: any function `(spec: OpenAPIObject, options: { specUrl: string }) => string | Response`.
`options.specUrl` is the path the spec is served at (`path`, default `/openapi.json`).

## Docs Protection

Basic auth built into core. When `docsAuth` is set, both the docs UI (`/docs`) and the spec endpoint (`/openapi.json`) return `401 Unauthorized` without valid credentials.

```ts
export default {
  docsAuth: {
    username: "admin",
    password: process.env.DOCS_PASSWORD,
  },
};
```

## Route Metadata

Customize per-route OpenAPI entries in the route's `openapi.ts`:

```typescript
// api/users/openapi.ts
export const GET = {
    summary: 'List all users',
    tags: ['Users'],
    operationId: 'listUsers',
    responses: {
        '200': { description: 'List of users' },
    },
};
```

When `schema.response` is defined, responses are auto-generated. User-provided responses in `openapi.ts` override auto-generated ones.

## Schema Conversion

Zod v4 schemas defined in `schema` exports are automatically converted to OpenAPI 3.1 schema objects. This includes:

- String types (minLength, maxLength, pattern)
- Number types (minimum, maximum)
- Arrays (items schema)
- Objects (properties, required)
- Enums
- Optional fields
- Default values

Generated details:

- `requestBody.required` is `true` unless the body schema accepts `undefined` (for example `z.object({...}).optional()`).
- Wildcard routes document the wildcard as a `{wildcard}` path parameter that may contain slashes; `:param` names may contain `-` and `_`.
- Non-Zod (Standard Schema) params/query/headers are emitted by name. With a converter the parameter gets the real schema; without one it gets `schema: {}` instead of being dropped.
- `docsAuth` accepts UTF-8 usernames/passwords.

For non-Zod validators (Valibot, ArkType, Effect Schema), provide a converter via `mapJsonSchema`:

```ts
export default {
  mapJsonSchema: {
    zod: z.toJSONSchema,        // Zod 4 built-in (auto-detected)
    valibot: toJsonSchema,      // user provides
    arktype: toJsonSchema,      // user provides
  },
};
```

## Full Metadata

All OpenAPI 3.1 document-level fields are supported:

```ts
export default {
  title: "My API",
  description: "...",
  version: "1.0.0",
  servers: [{ url: "https://api.example.com" }],
  contact: { name: "Team", email: "api@example.com" },
  license: { name: "MIT" },
  termsOfService: "https://example.com/terms",
  externalDocs: { url: "https://docs.example.com", description: "Full docs" },
};
```
