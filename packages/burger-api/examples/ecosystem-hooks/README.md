# Ecosystem Hooks Example

Catalog of all 8 official lifecycle hooks from `ecosystem/hooks/`.

## Hooks Demonstrated

| Hook | Purpose |
|------|---------|
| `cors` | Cross-Origin Resource Sharing headers |
| `logger` | Request/response logging |
| `rate-limiter` | Rate limiting per IP |
| `compression` | Response body compression |
| `security-headers` | Security-related headers |
| `timeout` | Request timeout |
| `body-size-limiter` | Request body size limits |
| `cache` | Cache-Control headers |

Authentication hooks now live in `ecosystem/plugins/` (jwt-auth, api-key, and
friends).

## Run

```bash
bun run src/index.ts
```
