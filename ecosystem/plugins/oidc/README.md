# OIDC Plugin

Official OpenID Connect authentication plugin for BurgerAPI. Parses OIDC token, verifies signature against provider's JWKS, and attaches user info to context.

## Features

- Standard OpenID Connect discovery
- JWKS-based token verification
- Automatic JWKS caching
- Configurable issuer and audience validation
- Clock tolerance for distributed systems

## Installation

```bash
burger-api add oidc
```

Or manually copy to `ecosystem/plugins/oidc/`.

## Usage

### Google OIDC

```typescript
// src/plugins.ts
import { Burger } from "burger-api";
import { oidc } from "./ecosystem/plugins/oidc/oidc";

const burger = new Burger();

burger.usePlugin(oidc({
  issuer: "https://accounts.google.com",
  audience: "my-client-id",
}));
```

### Auth0

```typescript
burger.usePlugin(oidc({
  issuer: "https://my-tenant.auth0.com/",
  audience: "https://api.myapp.com",
}));
```

### Azure AD

```typescript
burger.usePlugin(oidc({
  issuer: "https://login.microsoftonline.com/{tenant-id}/v2.0",
  audience: "my-app-id",
}));
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `issuer` | `string` | - | OIDC issuer URL (required) |
| `audience` | `string` | - | Required audience claim |
| `header` | `string` | `"Authorization"` | Header name to extract token from |
| `prefix` | `string` | `"Bearer"` | Token prefix |
| `clockTolerance` | `number` | `0` | Clock tolerance in seconds |
| `jwksCacheTtl` | `number` | `3600` | JWKS cache TTL in seconds |

## Route configuration

### Disable auth for public routes

```typescript
// api/public/config.ts
export default {
  auth: false,
};
```

### Require authentication

```typescript
// api/private/config.ts
export default {
  auth: {
    required: true,
  },
};
```

## Context properties

After successful validation, the decoded token payload is available as `ctx.user`:

```typescript
export async function GET(ctx: BurgerContext) {
  const user = ctx.user as Record<string, unknown>;
  return Response.json({ userId: user.sub });
}
```

## Error responses

- **401 Unauthorized** — Missing token, invalid token, expired token, invalid issuer/audience

## Security notes

- Always validate both `issuer` and `audience` in production
- Use appropriate `clockTolerance` for distributed systems
- JWKS are cached for performance - consider cache TTL for key rotation
- Token verification happens on every request
- Consider using a JWT plugin for simpler use cases (e.g., HMAC)
