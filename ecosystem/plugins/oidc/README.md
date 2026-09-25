# OIDC Plugin

Official OpenID Connect authentication plugin for BurgerAPI. Parses OIDC token, verifies signature against provider's JWKS, and attaches user info to context.

## Features

- Standard OpenID Connect discovery
- JWKS-based token verification
- Automatic JWKS caching
- Configurable issuer and audience validation
- Clock tolerance for distributed systems
- Provider failures are logged server-side and answered with `503`, so an
  outage never masquerades as a bad token (`401`)

## Installation

```bash
burger-api add oidc
```

Or manually copy to `ecosystem/plugins/oidc/`.

## Usage

Register the plugin in `src/plugins.ts`. The module exports a default function
that receives the `Burger` instance:

### Google OIDC

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { oidc } from "../ecosystem/plugins/oidc/oidc";

export default function (burger: PluginRegistrar) {
  burger.usePlugin(oidc({
    issuer: "https://accounts.google.com",
    audience: "my-client-id",
  }));
}
```

### Auth0

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(oidc({
    issuer: "https://my-tenant.auth0.com/",
    audience: "https://api.myapp.com",
  }));
}
```

### Azure AD

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(oidc({
    issuer: "https://login.microsoftonline.com/{tenant-id}/v2.0",
    audience: "my-app-id",
  }));
}
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
| `algorithms` | `string[]` | `["RS256", "ES256"]` | Allowed token `alg` values |
| `requireExpiration` | `boolean` | `true` | Reject tokens without an `exp` claim |

Tokens are verified in the plugin's `beforeRoute` hook, so `401`/`503`
responses are produced before the route handler runs. Routes with
`auth: false` skip verification entirely.

## Route configuration

### Disable auth for public routes

```typescript
// src/api/public/config.ts
export default {
  auth: false,
};
```

### Require authentication

```typescript
// src/api/private/config.ts
export default {
  auth: {
    required: true,
  },
};
```

## Context properties

After successful validation, the verified token claims are available as
`ctx.user` (typed by the plugin's `declare module "burger-api"`
augmentation — no cast needed):

```typescript
import type { BurgerContext } from "burger-api";

export async function GET(ctx: BurgerContext) {
  return Response.json({ userId: ctx.user?.sub });
}
```

## Error responses

- **401 Unauthorized** — Missing token, invalid signature, expired token,
  invalid issuer/audience
- **503 Service Unavailable** — OIDC discovery or JWKS could not be reached.
  The failure is logged with `console.error`; the client should retry (the
  token itself was not evaluated).

## Security notes

- Always validate both `issuer` and `audience` in production
- Use appropriate `clockTolerance` for distributed systems
- JWKS are cached for performance - consider cache TTL for key rotation
- Token verification happens on every request
- Consider using a JWT plugin for simpler use cases (e.g., HMAC)
