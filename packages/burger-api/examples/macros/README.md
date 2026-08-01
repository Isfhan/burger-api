# Macros Example

Demonstrates `burger.macro()` for creating reusable, parameterized hook factories.

## Macros Defined

- `requireRole(role)` — checks `ctx.services.user.role` against the required role
- `rateLimit(maxRequests)` — limits requests per handler invocation

## Run

```bash
bun run src/index.ts
```
