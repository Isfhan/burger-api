# Page Routing Example

Demonstrates BurgerAPI's file-based page routing with `.html` and `.tsx` pages.

## Pages

| File | URL | Type |
|------|-----|------|
| `src/pages/index.html` | `/` | Static HTML |
| `src/pages/about.html` | `/about` | Static HTML |
| `src/pages/(marketing)/landing.html` | `/landing` | Static HTML (group ignored) |
| `src/pages/blog/[slug]/index.tsx` | `/blog/:slug` | Dynamic TSX handler |
| `src/pages/docs/guides/getting-started.html` | `/docs/guides/getting-started` | Nested static HTML |

## Run

```bash
bun run src/index.ts
```

## Test

```bash
bun test api.test.ts
```
