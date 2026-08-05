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
import type { Burger } from "burger-api";
import { basicAuth } from "../ecosystem/plugins/basic-auth/basic-auth";

export default function (burger: Burger) {
  burger.usePlugin(basicAuth({
    validate: async (username, password) => {
      // Check against database
      const user = await db.users.findByUsername(username);
      if (user && user.password === password) {
        return { id: user.id, username: user.username, roles: user.roles };
      }
      return null;
    },
  }));
}
```

### With custom realm

```typescript
export default function (burger: Burger) {
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
  if (user && user.password === password) {
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
export async function GET(ctx: BurgerContext) {
  const user = ctx.user as BasicAuthUser;
  return Response.json({ userId: user.id, username: user.username });
}
```

## Error responses

- **401 Unauthorized** — Missing Basic authentication or invalid credentials
- Includes `WWW-Authenticate: Basic realm="Restricted"` header

## Security notes

- Always use HTTPS (Basic auth sends credentials in Base64, not encrypted)
- Never store passwords in plain text - use hashing (bcrypt, argon2)
- Consider rate limiting for authentication attempts
- Use environment variables for sensitive configuration
- Basic auth is simple but less secure than JWT or session-based auth
