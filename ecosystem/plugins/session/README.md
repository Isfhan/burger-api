# Session Plugin

Official session management plugin for BurgerAPI. Parses the session ID from a
cookie, loads session data from a configurable store, and exposes it as
`ctx.session`. Whatever your handler writes to `ctx.session` is persisted.

## Features

- Cookie-based sessions, created lazily (no store entry or cookie until a
  handler writes data)
- Configurable session store (in-memory, Redis, database, etc.)
- HMAC-signed session IDs
- Session ID rotation whenever session data changes (login/logout)
- Configurable cookie options (Secure, HttpOnly, SameSite, …)
- Typed `ctx.session` (ships a `BurgerContext` augmentation)

## Installation

```bash
burger-api add session
```

Or manually copy to `ecosystem/plugins/session/`.

## Usage

Register the plugin in `src/plugins.ts`:

### Basic usage (in-memory store)

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { session } from "../ecosystem/plugins/session/session";

export default function (burger: PluginRegistrar) {
  burger.usePlugin(session({
    secret: process.env.SESSION_SECRET, // long random string
  }));
}
```

### Session lifecycle

| Handler does | Result |
|--------------|--------|
| Never touches `ctx.session` (no cookie) | Nothing — no store entry, no `Set-Cookie` |
| `ctx.session = { userId: "42" }` | New session stored, `Set-Cookie` issued |
| Mutates an existing session (`ctx.session.cart = [...]`) | Data saved; ID rotated (new `Set-Cookie`) unless `regenerateOnAuth: false` |
| Reads without changing | Nothing written |
| `ctx.session = undefined` | Session destroyed, cookie expired |

### Login / logout / protected route

By default **every route requires an existing session** (the plugin's
`beforeRoute` throws `401 Session required` when there is none). Mark routes
that must work without a session — at least the login route — with
`auth: false`:

```typescript
// src/api/login/config.ts
export default { auth: false };
```

```typescript
// src/api/login/route.ts
import type { BurgerContext } from "burger-api";

export async function POST(ctx: BurgerContext) {
  const { username } = await ctx.json();
  // ...verify credentials...
  ctx.session = { userId: "42", username }; // persisted + cookie issued
  return Response.json({ ok: true });
}
```

```typescript
// src/api/logout/route.ts
import type { BurgerContext } from "burger-api";

export async function POST(ctx: BurgerContext) {
  ctx.session = undefined; // destroyed + cookie expired
  return Response.json({ ok: true });
}
```

> ⚠️ **A session existing is not authentication.** The default check only
> proves the client holds a valid session cookie; a session can hold a cart
> or preferences for an anonymous visitor. To require a **logged-in user**,
> check the field your login handler sets:

```typescript
// src/api/profile/hooks.ts
import type { BurgerContext } from "burger-api";
import { UnauthorizedError } from "burger-api";

export const beforeRoute = (ctx: BurgerContext) => {
  if (!ctx.session?.userId) {
    throw new UnauthorizedError("Login required");
  }
};
```

```typescript
// src/api/profile/route.ts
import type { BurgerContext } from "burger-api";

export async function GET(ctx: BurgerContext) {
  return Response.json({ userId: ctx.session?.userId });
}
```

### With custom store

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { session, type SessionStore } from "../ecosystem/plugins/session/session";

// Implement your own store (Redis example, pseudo-client `redis`)
const redisStore: SessionStore = {
  async get(id) {
    const data = await redis.get(`session:${id}`);
    return data ? JSON.parse(data) : null;
  },
  async set(id, data, maxAge) {
    await redis.setex(`session:${id}`, maxAge ?? 86400, JSON.stringify(data));
  },
  async destroy(id) {
    await redis.del(`session:${id}`);
  },
};

export default function (burger: PluginRegistrar) {
  burger.usePlugin(session({
    secret: process.env.SESSION_SECRET,
    store: redisStore,
    maxAge: 86400, // 24 hours
  }));
}
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
| `secret` | `string` | - | Secret for signing session IDs (warns in production when missing) |
| `regenerateOnAuth` | `boolean` | `true` | Rotate the session ID whenever session data changes |

## Session store interface

```typescript
interface SessionStore {
  get(id: string): Promise<Record<string, unknown> | null>;
  set(id: string, data: Record<string, unknown>, maxAge?: number): Promise<void>;
  destroy(id: string): Promise<void>;
}
```

## Route configuration

| `config.ts` | Behavior |
|-------------|----------|
| (none) / `auth: true` | Session required (401 without one) |
| `auth: false` or `auth: { required: false }` | No session required; `ctx.session` is still loaded when present |

## Context properties

`ctx.session` is typed as `Record<string, unknown> | undefined` by the
plugin's `declare module "burger-api"` augmentation — no casts needed.

## Error responses

- **401 Unauthorized** — `Session required`: no valid session on a route
  without `auth: false`

## Security notes

- Always use `secret` in production to sign session IDs
- Use `secure: true` in production (HTTPS required)
- Use `sameSite: "strict"` for sensitive operations
- Consider using Redis or a database store for production (the in-memory
  store is per-process and lost on restart)
- Set an appropriate `maxAge` for your use case
