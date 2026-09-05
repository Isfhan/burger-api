# BurgerAPI Ecosystem Plugins

Official plugins for BurgerAPI 1.0. Plugins extend the application (register hooks, providers, context types) and live under `ecosystem/plugins/`. Each plugin is a factory that returns a `Plugin` object, registered on the `Burger` instance via `burger.usePlugin()` in `src/plugins.ts`.

## Available plugins

| Plugin | Factory | Description |
|--------|---------|-------------|
| [`jwt-auth`](./jwt-auth/) | `jwtAuth(options)` | JWT authentication (HS256/HS384/HS512) |
| [`session`](./session/) | `session(options)` | Session management with configurable stores |
| [`api-key`](./api-key/) | `apiKey(options)` | API key authentication via headers |
| [`basic-auth`](./basic-auth/) | `basicAuth(options)` | HTTP Basic authentication |
| [`oidc`](./oidc/) | `oidc(options)` | OpenID Connect authentication |
| [`env`](./env/) | `env(options)` | Environment variable validation |

## Usage

Install via CLI:

```bash
burger-api add jwt-auth
```

Or manually copy the plugin to `ecosystem/plugins/` and register it in `src/plugins.ts`:

```typescript
// src/plugins.ts
import type { PluginRegistrar } from 'burger-api';
import { jwtAuth } from '../ecosystem/plugins/jwt-auth/jwt-auth';

export default function (burger: PluginRegistrar) {
    burger.usePlugin(jwtAuth({
        secret: process.env.JWT_SECRET,
    }));
}
```

`src/plugins.ts` is auto-discovered (in dev) or passed to `new Burger({ pluginsModule })` in production builds. Never call `burger.usePlugin()` from `index.ts` — plugin registration lives in `src/plugins.ts`.

## Plugin interface

Each plugin factory returns a `Plugin` object:

```typescript
interface Plugin {
    name: string;
    hooks?: {
        onRequest?: Hook | Hook[];
        transform?: Record<string, (ctx: BurgerContext) => unknown>;
        beforeRoute?: Hook | Hook[];
        afterRoute?: Hook | Hook[];
        mapResponse?: Hook | Hook[];
        onError?: ErrorHook | ErrorHook[];
    };
}
```

A plugin declares its `name` and registers lifecycle hooks directly on the object. For example, `apiKey()` registers a `transform` that attaches `ctx.apiKey` and a `beforeRoute` that enforces it:

```typescript
burger.usePlugin(apiKey({
    keys: ['demo-api-key-123'],
}));
```

Registering the same plugin twice (same name + seed) is a no-op. `usePlugin(plugin, scope?, seed?)` also accepts an optional scope override and a seed for disambiguating multiple instances (e.g., two JWT plugins with different secrets).

## Hooks vs plugins

- **Hooks** control request execution: `onRequest`, `transform`, `beforeRoute`, `afterRoute`, `mapResponse`, `onError`
- **Plugins** extend the app (may register hooks, providers, context types)

They are separate concepts. Hooks are the request lifecycle; plugins are application extensions composed on top of them.

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
import type { PluginRegistrar } from 'burger-api';
import { jwtAuth } from '../ecosystem/plugins/jwt-auth/jwt-auth';

export default function (burger: PluginRegistrar) {
    burger.usePlugin(jwtAuth({
        secret: process.env.JWT_SECRET,
        algorithm: 'HS256',
    }));
}

// src/api/admin/config.ts (route override)
export default {
    auth: {
        required: true,
        roles: ['admin'],
    },
};
```
