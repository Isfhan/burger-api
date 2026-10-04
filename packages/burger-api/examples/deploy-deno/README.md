# Deploy: Deno

Same WinterCG app as `deploy-cloudflare` and `deploy-vercel` — only the entry
file and config differ.

## Run locally

```bash
bun link burger-api
bun test
deno serve --port 8000 src/index.ts
```

## Deploy

Push to Deno Deploy and point it at `src/index.ts` (it uses `deno serve`
under the hood).

## How it works

- `deno.json` maps `burger-api` to the npm package (`npm:burger-api`).
- `src/index.ts` exports the `deno serve` shape:
  `export default { fetch: toFetchHandler(burger) } satisfies Deno.ServeDefaultExport`.
- Routes are declared via `apiRoutes` — no filesystem scanning at runtime,
  and no `bun` imports in the module graph.
