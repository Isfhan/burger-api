# Basic Auth Plugin

Official HTTP Basic authentication plugin for BurgerAPI. Parses Basic auth header, decodes credentials, and validates against provided function.

## Features

- Standard HTTP Basic authentication
- Custom validation function
- User info attachment to context
- WWW-Authenticate header for 401 responses
- Configurable realm

## Installation

```bash
burger-api add basic-auth
```

Or manually copy to `ecosystem/plugins/basic-auth/`.

## Usage

Register the plugin in `src/plugins.ts`. The module exports a default function
that receives the `Burger` instance:

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { timingSafeEqual } from "burger-api";
import { basicAuth } from "../ecosystem/plugins/basic-auth/basic-auth";

export default function (burger: PluginRegistrar) {
  burger.usePlugin(basicAuth({
    validate: async (username, password) => {
      // Replace with your user lookup (compare password HASHES in real apps)
      const ok =
        timingSafeEqual(username, "admin") &&
        timingSafeEqual(password, process.env.ADMIN_PASSWORD ?? "");
      return ok ? { id: "1", username, roles: ["admin"] } : null;
    },
  }));
}
```

Every route now requires credentials (except routes with `auth: false` in
their `config.ts`). Without valid credentials the plugin responds `401` with
`WWW-Authenticate: Basic realm="Restricted"`, so browsers show their login
prompt. `validate` is required — `basicAuth()` without it throws at startup.

### With custom realm

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(basicAuth({
    validate: async (username, password) => {
      // ... validation logic
    },
    realm: "My API",
  }));
}
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `"Authorization"` | Header name to extract Basic auth from |
| `validate` | `(username: string, password: string) => Promise<BasicAuthUser \| null>` | - | Validation function (required) |
| `attachToContext` | `boolean` | `true` | Attach user info to context |
| `realm` | `string` | `"Restricted"` | Realm for WWW-Authenticate header |

## Validation function

The validation function receives the decoded username and password, and should return a user object if valid, or null if invalid:

```typescript
validate: async (username, password) => {
  const user = await db.users.findByUsername(username);
  // Never compare secrets with === (timing side channel)
  if (user && (await Bun.password.verify(password, user.passwordHash))) {
    return {
      id: user.id,
      username: user.username,
      roles: user.roles,
    };
  }
  return null;
}
```

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

After successful validation, the user info is available as `ctx.user`:

```typescript
import type { BurgerContext } from "burger-api";

export async function GET(ctx: BurgerContext) {
  return Response.json({ userId: ctx.user?.id, username: ctx.user?.username });
}
```

`ctx.user` is typed by the plugin's `declare module "burger-api"`
augmentation (shared with jwt-auth and oidc).

## Error responses

- **401 Unauthorized** — Missing Basic authentication or invalid credentials.
  RFC 9457 `application/problem+json` body plus
  `WWW-Authenticate: Basic realm="<realm>", charset="UTF-8"`.
  Successful responses carry no `WWW-Authenticate` header.

## Security notes

- Always use HTTPS (Basic auth sends credentials in Base64, not encrypted)
- Never store passwords in plain text - use hashing (bcrypt, argon2)
- Consider rate limiting for authentication attempts
- Use environment variables for sensitive configuration
- Basic auth is simple but less secure than JWT or session-based auth
