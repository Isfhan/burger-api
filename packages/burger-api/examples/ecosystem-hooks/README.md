# Ecosystem Hooks Example

Catalog of all 10 official lifecycle hooks from `ecosystem/hooks/`.

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
| `jwt-auth` | JWT authentication (needs secret) |
| `api-key-auth` | API key authentication (needs keys) |

## Run

```bash
bun run src/index.ts
```
