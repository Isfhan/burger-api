<div align="center">
  <a href="https://burger-api.com">
    <img src="https://github.com/user-attachments/assets/0d9b376e-1d89-479a-aa7f-e7ee3c6b2342" alt="BurgerAPI"/>
  </a>
</div>

<p align="center">
  <a href="https://www.npmjs.com/package/burger-api"><img src="https://img.shields.io/badge/version-1.0.0--beta-orange.svg" alt="Version 1.0.0-beta" /></a>
  <a href="https://github.com/isfhan/burger-api/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.4.4%2B-black?logo=bun" alt="Bun 1.4.4+" /></a>
</p>

**burger-api** is a fast, file-based API framework for Bun, for TypeScript and
JavaScript. Write routes as files, validate with the schema library you like,
and get OpenAPI docs for free. Deploy to Bun, Node, Cloudflare Workers, Deno or
Vercel.

> **1.0.0-beta is a new BurgerAPI**, rewritten from the ground up. Coming from
> `0.9.7`? Read the [migration guide](https://burger-api.com/docs/migration).
> Getting an error? Update to the latest version first
> (`bun add burger-api@latest` and `bun add -g @burger-api/cli@latest`). Still
> broken? [Open an issue](https://github.com/isfhan/burger-api/issues).

## Get started

```bash
bunx @burger-api/cli create my-api
cd my-api
bun run dev
```

Or add it to an existing project:

```bash
bun add burger-api
```

Requires Bun 1.4.4+ (or Node 24.22.1+ with
[`@burger-api/node-server`](https://www.npmjs.com/package/@burger-api/node-server)).

## Example

```
src/
├── index.ts
└── api/
    └── users/
        ├── route.ts     # handlers
        └── schema.ts    # validation
```

```ts
// src/index.ts
import { Burger } from 'burger-api';

const app = new Burger({ apiDir: './src/api' });
app.serve(4000);
```

```ts
// src/api/users/schema.ts
import { z } from 'zod';

export const POST = {
    body: z.object({ name: z.string(), email: z.email() }),
};
```

```ts
// src/api/users/route.ts
import { defineRoute } from 'burger-api';
import { POST as PostSchema } from './schema';

export const POST = defineRoute(PostSchema, (ctx) => {
    const user = ctx.validated.body; // typed from schema.ts
    return Response.json({ created: user }, { status: 201 });
});
```

`POST /api/users` now validates the body, returns a clear `422` error when it
is wrong, and shows up in the docs at `/docs`.

## Features

- **File-based routing:** `[param]` and `[...]` wildcard folders; `HEAD`,
  `OPTIONS` and `405` handled for you.
- **Hooks:** `onRequest`, `transform`, `beforeRoute`, `afterRoute`,
  `mapResponse` and `onError`, global in `src/hooks.ts` or per route.
- **Validation:** any Standard Schema library (Zod, Valibot, ArkType) for body,
  query, params, headers, cookies and responses. Errors follow RFC 9457.
- **OpenAPI 3.1:** generated from your routes and schemas, with Swagger UI,
  Scalar or Redoc.
- **Plugins and providers:** add hooks with `burger.usePlugin()`, share services
  with `burger.provide()`.
- **WebSockets:** file-based routes under `src/websocket/`.
- **Pages:** HTML pages and static assets under `src/pages/`.
- **Deploy anywhere:** `app.serve()` on Bun, `toFetchHandler(app)` for Node,
  Cloudflare Workers, Deno and Vercel.
- **JavaScript is first-class:** the same conventions in `.js` and `.mjs`.

## Ecosystem

Official hooks and plugins you can copy into your project with the CLI:

```bash
burger-api add cors logger rate-limiter jwt-auth
```

- **Hooks:** cors, logger, rate-limiter, cache, compression, security-headers,
  timeout, body-size-limiter
- **Plugins:** jwt-auth, api-key, basic-auth, session, oidc, env

## Documentation

- **Docs:** [burger-api.com](https://burger-api.com)
- **CLI:** [`@burger-api/cli`](https://www.npmjs.com/package/@burger-api/cli)
- **Changelog:** [CHANGELOG.md](https://github.com/isfhan/burger-api/blob/main/packages/burger-api/CHANGELOG.md)

## License

[MIT](https://github.com/isfhan/burger-api/blob/main/LICENSE)
