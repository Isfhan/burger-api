# Session Plugin

Official session management plugin for BurgerAPI. Parses session ID from cookie, loads session data from configurable store, and attaches session object to context.

## Features

- Cookie-based session management
- Configurable session store (in-memory, Redis, database, etc.)
- Session ID signing for security
- Automatic session regeneration
- Configurable cookie options (secure, HttpOnly, SameSite, etc.)

## Installation

```bash
burger-api add session
```

Or manually copy to `ecosystem/plugins/session/`.

## Usage

### Basic usage (in-memory store)

```typescript
// src/plugins.ts
import { Burger } from "burger-api";
import { session } from "./ecosystem/plugins/session/session";

const burger = new Burger();

burger.usePlugin(session({
  secret: process.env.SESSION_SECRET,
}));
```

### With custom store

```typescript
// src/plugins.ts
import { Burger } from "burger-api";
import { session } from "./ecosystem/plugins/session/session";

// Implement your own store
const redisStore = {
  async get(id: string) {
    const data = await redis.get(`session:${id}`);
    return data ? JSON.parse(data) : null;
  },
  async set(id: string, data: Record<string, unknown>, maxAge?: number) {
    await redis.setex(`session:${id}`, maxAge ?? 86400, JSON.stringify(data));
  },
  async destroy(id: string) {
    await redis.del(`session:${id}`);
  },
};

burger.usePlugin(session({
  secret: process.env.SESSION_SECRET,
  store: redisStore,
  maxAge: 86400, // 24 hours
}));
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cookie` | `string` | `"session_id"` | Cookie name for session ID |
| `maxAge` | `number` | `86400` | Max session age in seconds (24h) |
| `store` | `SessionStore` | `MemorySessionStore` | Session store |
| `secure` | `boolean` | `true` (prod) | Use secure cookies |
| `path` | `string` | `"/"` | Cookie path |
| `domain` | `string` | - | Cookie domain |
| `sameSite` | `string` | `"lax"` | SameSite cookie attribute |
| `secret` | `string` | - | Secret for signing session IDs |
| `regenerateOnAuth` | `boolean` | `true` | Regenerate session ID on auth |

## Session store interface

```typescript
interface SessionStore {
  get(id: string): Promise<Record<string, unknown> | null>;
  set(id: string, data: Record<string, unknown>, maxAge?: number): Promise<void>;
  destroy(id: string): Promise<void>;
}
```

## Route configuration

### Disable session for public routes

```typescript
// api/public/config.ts
export default {
  auth: false,
};
```

### Require session

```typescript
// api/profile/config.ts
export default {
  auth: {
    required: true,
  },
};
```

## Context properties

After successful session load, the session data is available as `ctx.session`:

```typescript
export async function GET(ctx: BurgerContext) {
  const session = ctx.session as Record<string, unknown>;
  return Response.json({ userId: session.userId });
}
```

## Error responses

- **401 Unauthorized** — Session required but not found

## Security notes

- Always use `secret` in production to sign session IDs
- Use `secure: true` in production (HTTPS required)
- Use `sameSite: "strict"` for sensitive operations
- Consider using Redis or database store for production (in-memory store is not persistent)
- Set appropriate `maxAge` for your use case
