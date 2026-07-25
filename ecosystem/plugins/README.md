# BurgerAPI Ecosystem Plugins

Official plugins for BurgerAPI. Plugins extend the application (register hooks, providers, context types) and live under `ecosystem/plugins/`.

## Available plugins

| Plugin | Description |
|--------|-------------|
| [`jwt-auth`](./jwt-auth/) | JWT authentication (HS256/HS384/HS512) |
| [`session`](./session/) | Session management with configurable stores |
| [`api-key`](./api-key/) | API key authentication via headers |
| [`basic-auth`](./basic-auth/) | HTTP Basic authentication |
| [`oidc`](./oidc/) | OpenID Connect authentication |
| [`env`](./env/) | Environment variable validation |

## Usage

Install via CLI:

```bash
burger-api add jwt-auth
```

Or manually copy the plugin to `ecosystem/plugins/` and register in `src/plugins.ts`:

```typescript
import { Burger } from "burger-api";
import { jwtAuth } from "./ecosystem/plugins/jwt-auth/jwt-auth";

const burger = new Burger();

burger.usePlugin(jwtAuth({
  secret: process.env.JWT_SECRET,
}));
```

## Plugin interface

Plugins implement the `Plugin` interface:

```typescript
interface Plugin {
  name: string;
  install(burger: Burger): void | Promise<void>;
}
```

Plugins may register hooks, providers, and context types via the `burger` instance.

## Hooks vs plugins

- **Hooks** control request execution: `onRequest`, `transform`, `beforeRoute`, `afterRoute`, `mapResponse`, `onError`
- **Plugins** extend the app (may register hooks, providers, context types)

They are separate concepts. Hooks are not "middleware renamed." Plugins are not a replacement for hooks.

## Creating plugins

Use `burger-api generate plugin <name>` to scaffold a new plugin:

```bash
burger-api generate plugin my-plugin
```

This creates `ecosystem/plugins/my-plugin/my-plugin.ts` with a minimal template.

## Configuration model

Plugins support two-tier configuration:

- **Global defaults** — set in `src/plugins.ts` when registering the plugin
- **Route overrides** — per-route in `config.ts`

Example:

```typescript
// src/plugins.ts (global defaults)
burger.usePlugin(jwtAuth({
  secret: process.env.JWT_SECRET,
  algorithm: "HS256",
}));

// api/admin/config.ts (route override)
export default {
  auth: {
    required: true,
    roles: ["admin"],
  },
};
```
