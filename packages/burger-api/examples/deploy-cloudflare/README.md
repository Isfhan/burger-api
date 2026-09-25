# Deploy: Cloudflare Workers

Same WinterCG app as `deploy-vercel` and `deploy-deno` — only the entry file
and config differ.

## Run locally

```bash
bun link burger-api
bun test
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
```

## How it works

- `src/index.ts` exports the standard Workers shape:
  `export default { fetch: toFetchHandler(burger) }`.
- Routes are declared via `apiRoutes` — no filesystem scanning at runtime.
- The module graph contains no `bun` imports: the Bun adapter is only
  reachable through a lazy, non-static dynamic import that `wrangler`'s
  bundler keeps external and never executes on Workers.
