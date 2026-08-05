# JWT Auth Plugin

Official JWT authentication plugin for BurgerAPI. Parses JWT from Authorization header, verifies signature, and attaches decoded payload to context.

## Features

- Support for HMAC algorithms (HS256, HS384, HS512)
- Support for RSA algorithms (RS256, RS384, RS512)
- Support for ECDSA algorithms (ES256, ES384, ES512)
- Built-in token expiration and not-before validation
- Configurable issuer and audience validation
- Role-based access control support
- Clock tolerance for expiration checks

## Installation

```bash
burger-api add jwt-auth
```

Or manually copy to `ecosystem/plugins/jwt-auth/`.

## Usage

Register the plugin in `src/plugins.ts`. The module exports a default function
that receives the `Burger` instance:

### Basic HMAC (HS256)

```typescript
// src/plugins.ts
import type { Burger } from "burger-api";
import { jwtAuth } from "../ecosystem/plugins/jwt-auth/jwt-auth";

export default function (burger: Burger) {
  burger.usePlugin(jwtAuth({
    secret: process.env.JWT_SECRET,
  }));
}
```

### RS256 (Asymmetric)

```typescript
// Load public key (e.g., from JWKS endpoint)
const publicKey = await crypto.subtle.importKey(
  "spki",
  new Uint8Array(/* ... */),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["verify"]
);

export default function (burger: Burger) {
  burger.usePlugin(jwtAuth({
    publicKey,
    algorithm: "RS256",
  }));
}
```

### With issuer and audience validation

```typescript
export default function (burger: Burger) {
  burger.usePlugin(jwtAuth({
    secret: process.env.JWT_SECRET,
    algorithm: "HS256",
    issuer: "https://auth.myapp.com",
    audience: "https://api.myapp.com",
  }));
}
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string \| CryptoKey` | - | Secret key for HMAC algorithms |
| `publicKey` | `CryptoKey` | - | Public key for asymmetric algorithms |
| `algorithm` | `string` | `"HS256"` | JWT signing algorithm |
| `header` | `string` | `"Authorization"` | Header name to extract token from |
| `prefix` | `string` | `"Bearer"` | Token prefix |
| `issuer` | `string` | - | Required issuer claim |
| `audience` | `string` | - | Required audience claim |
| `clockTolerance` | `number` | `0` | Clock tolerance in seconds |

## Route configuration

### Disable auth for public routes

```typescript
// src/api/public/config.ts
export default {
  auth: false,
};
```

### Require specific roles

```typescript
// src/api/admin/config.ts
export default {
  auth: {
    required: true,
    roles: ["admin"],
  },
};
```

## Context properties

After successful authentication, the decoded JWT payload is available as `ctx.user`:

```typescript
export async function GET(ctx: BurgerContext) {
  const user = ctx.user as JwtPayload;
  return Response.json({ userId: user.sub });
}
```

## Error responses

- **401 Unauthorized** — Missing token, invalid token, expired token
- **403 Forbidden** — Authenticated but insufficient permissions

## Security notes

- Always use HTTPS in production
- Store secrets securely (environment variables, secrets manager)
- Use appropriate algorithm for your use case:
  - HMAC: symmetric, single secret
  - RSA/ECDSA: asymmetric, public/private key pair
- Set reasonable `clockTolerance` for distributed systems
- Validate `issuer` and `audience` to prevent token substitution attacks
