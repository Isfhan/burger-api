<p align="center">
  <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342" alt="BurgerAPI logo"/>
</p>

<p align="center">
  <strong>A fast, file-based API framework for Bun, with TypeScript and JavaScript</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/burger-api"><img src="https://img.shields.io/npm/v/burger-api.svg?label=burger-api" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.4.4%2B-black?logo=bun" alt="Bun 1.4.4+" /></a>
  <a href="https://burger-api.com"><img src="https://img.shields.io/badge/docs-burger--api.com-green.svg" alt="Documentation" /></a>
</p>

> **1.0.0-beta is a new BurgerAPI.** The framework and the CLI were rewritten
> from the ground up: a new core, a hook-based lifecycle, plugins, Standard
> Schema validation and more. Coming from `burger-api@0.9.7` or
> `@burger-api/cli@0.9.9`? Read the
> [migration guide](https://burger-api.com/docs/migration).

## Quick start

```bash
bunx @burger-api/cli create my-api
cd my-api
bun run dev
```

Open http://localhost:4000/docs to see your API documentation.

A route is a folder with a `route.ts` file:

```ts
// src/api/users/[id]/route.ts  →  GET /api/users/:id
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({ id: ctx.params.id });
}
```

## Features

- **File-based routing:** folders become URLs, with `[param]` and `[...]`
  wildcard routes.
- **Hooks:** six lifecycle points (`onRequest`, `transform`, `beforeRoute`,
  `afterRoute`, `mapResponse`, `onError`), global or per route.
- **Validation:** Zod, Valibot or ArkType for body, query, params, headers,
  cookies and responses, with fully typed `ctx.validated`.
- **OpenAPI 3.1:** generated from your routes, with Swagger UI, Scalar or Redoc
  at `/docs`.
- **Plugins and providers:** add features in `src/plugins.ts`, share services in
  `src/providers.ts`.
- **WebSockets and pages:** file-based, next to your API.
- **Runs everywhere:** Bun, Node, Cloudflare Workers, Deno and Vercel.
- **Fast:** every route becomes a native Bun route.

## Packages

| Package | Description |
| --- | --- |
| [`burger-api`](./packages/burger-api) | The framework |
| [`@burger-api/cli`](./packages/cli) | Create, run, build and check projects |
| [`@burger-api/node-server`](./packages/node-server) | Run a burger-api app on Node.js |
| [`ecosystem/`](./ecosystem) | Official hooks and plugins, installed with `burger-api add` |

## Documentation

Everything is on **[burger-api.com](https://burger-api.com)**: guides, API
reference, deployment and examples.

## Contributing

Bug reports, ideas and pull requests are welcome. See
[CONTRIBUTING.md](./CONTRIBUTING.md) to set up the repo and run the tests.

```bash
bun install
bun run test:all
```

## License

[MIT](./LICENSE) © [Isfhan Ahmed](https://github.com/isfhan)
