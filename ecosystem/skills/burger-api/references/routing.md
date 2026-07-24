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
