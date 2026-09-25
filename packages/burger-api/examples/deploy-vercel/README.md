# Deploy: Vercel

Same WinterCG app as `deploy-cloudflare` and `deploy-deno` — only the entry
file and config differ.

## Run locally

```bash
bun link burger-api
bun test
npx vercel dev
```

## Deploy

```bash
npx vercel --prod
```

## How it works

- `api/index.ts` exports the Vercel web-standard shape:
  `export default { fetch: toFetchHandler(burger) }` (Node.js runtime —
  `export const runtime = 'nodejs'`).
- `vercel.json` rewrites all paths to `/api`, so `toFetchHandler` does the
  routing (dynamic params, 404s, method handling).
- Routes are declared via `apiRoutes` — no filesystem scanning at runtime,
  and no `bun` imports in the module graph.
