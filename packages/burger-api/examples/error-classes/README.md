# Error Classes Example

Demonstrates HTTP error classes for clean error handling.

## Error Classes Used

- `NotFoundError` (404) — resource not found
- `UnauthorizedError` (401) — missing authentication
- `ForbiddenError` (403) — insufficient permissions

All errors produce RFC 9457 Problem Details responses.

## Run

```bash
bun run src/index.ts
```
