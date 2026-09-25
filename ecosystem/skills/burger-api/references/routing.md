# File-Based Routing Reference

## Route Discovery

Routes are discovered by scanning the filesystem for `route.ts` files. In production builds, the CLI scans routes when the app is built — prepared ahead of time (AOT) — and embeds them.

## Priority Order

Routes are matched in this order:
1. **Static** — exact path matches first
2. **Dynamic** — `[param]` segments matched next
3. **Wildcard** — `[...]` segments matched last

## Dynamic Routes

```typescript
// api/users/[id]/route.ts
export async function GET(ctx: BurgerContext) {
    const { id } = ctx.validated?.params || {};
    return Response.json({ userId: id });
}
```

Dynamic segments are accessed via `ctx.params` (unvalidated) or `ctx.validated.params` (after Zod validation).

## Wildcard Routes

```typescript
// api/files/[...]/route.ts
export async function GET(ctx: BurgerContext) {
    const segments = ctx.wildcardParams || [];
    return Response.json({ path: segments.join('/') });
}
```

Wildcard params is an array of path segments matching `*`. Works inside dynamic routes too: `api/users/[userId]/[...]/route.ts`

## Route Groups

Group folders `(groupName)` are ignored in URL generation:

```
api/(admin)/users/route.ts  →  /api/users
api/(v1)/products/route.ts  →  /api/products
```

Groups can be nested and are useful for organizing routes by feature, version, or access level.

## Nested Routes

```typescript
// api/posts/[postId]/comments/[commentId]/route.ts
export async function GET(ctx: BurgerContext) {
    const { postId, commentId } = ctx.validated?.params || {};
    return Response.json({ postId, commentId });
}
```

## Page Routes

Pages live under `pageDir` (default `src/pages`) and are discovered the same
way API routes are. Two file types are supported — **both are real, neither
is a fallback for the other**:

```
src/pages/index.html          →  /
src/pages/about.html          →  /about
src/pages/blog/[slug]/index.tsx  →  /blog/:slug
```

- **`.html`** — served as static markup.
- **`.tsx`** — a plain handler function that returns a `Response`, exactly
  like an API route handler:

```typescript
// src/pages/blog/[slug]/index.tsx
import type { BurgerContext } from 'burger-api';

export default async function GET(ctx: BurgerContext): Promise<Response> {
    const slug = (ctx.params as Record<string, string>)?.slug ?? 'unknown';
    return new Response(`<h1>Post: ${slug}</h1>`, {
        headers: { 'Content-Type': 'text/html' },
    });
}
```

`.tsx` here does **not** mean React or JSX server-side rendering — there is
no SSR/hydration step. It's a `.tsx` file purely so JSX-shaped return values
type-check if you choose to use them; a page handler that returns a plain
`Response` (as above) works identically.

Static assets go under `<pageDir>/assets/` (e.g. `src/pages/assets/style.css`
→ served at `/assets/style.css`).

## WebSocket Route Scaffolding

WebSocket routes live under `wsDir` (default `src/websocket`) and use their
own convention files — **not** `route.ts`:

```
src/websocket/chat/ws.ts       # handlers: open, message, close, drain, ping, pong
src/websocket/chat/hooks.ts    # onOpen, onMessage, onClose (optional)
src/websocket/chat/config.ts   # per-route config (optional)
```

```typescript
// src/websocket/chat/ws.ts
import type { BurgerWS } from 'burger-api';

export function open(ws: BurgerWS) {
    ws.subscribe('chat');
}

export function message(ws: BurgerWS, message: string | Buffer) {
    ws.publish('chat', message); // broadcast to every subscriber
}
```

Scaffold with `burger-api generate ws <path>` (see `cli.md`), or opt into a
sample route at project creation time via `create`'s "Do you need WebSocket
routes?" prompt. `ws.ts`/`ws.js`/`ws.mjs` are all valid extensions,
resolved the same way `apiDir`/`pageDir` are (see Directory Path Resolution
below).

## AOT Routing (Production Builds)

Routes are prepared ahead of time (AOT), i.e. built into the app before it runs. In production (`burger-api build`), the CLI:
1. Scans the apiDir and pageDir when the app is built
2. Generates a virtual entry file with static imports
3. Bun bundles the app with embedded route metadata
4. The running server uses these pre-built routes — no filesystem scanning

This means `apiRoutes` and `pageRoutes` arrays can be passed to the Burger constructor instead of `apiDir`/`pageDir`:

```typescript
import { apiRoutes, pageRoutes } from './.build/routes';

const app = new Burger({
    apiRoutes,
    pageRoutes,
    // ... rest of config
});
```

## Directory Path Resolution

`apiDir`, `pageDir`, and `wsDir` resolve in this order until one exists:

1. Absolute path, used as-is.
2. Relative to the project root (e.g. `./src/api`).
3. Relative to the entry file's directory when run via `burger-api dev`/`build` — for the default entry `src/index.ts` that is `src/`, so `apiDir: 'api'` finds `src/api`.

The project root wins when both exist. Bare `bun src/index.ts` (no CLI) skips the entry fallback. Unresolvable dirs fail with an error naming the exact paths tried (e.g. `Routes directory "backend" does not exist. Tried "./backend" (project root) and "./src/backend" (src/).`).
