# OpenAPI Config Example

Demonstrates the `src/openapi.config.ts` convention file with docs auth and custom metadata.

## Convention Files

- `src/openapi.config.ts` — auto-discovered; configures OpenAPI spec and docs UI
- `src/index.ts` — clean Burger setup

## Run

```bash
bun run src/index.ts
```

## Docs Auth

The docs UI at `/docs` is protected with basic auth:
- Username: `admin`
- Password: `secret`
