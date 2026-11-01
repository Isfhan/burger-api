# BurgerAPI Ecosystem Plugins

Official plugins for BurgerAPI 1.0. Plugins extend the application (they may
register hooks, providers, and context types). Each plugin is a factory that
returns a `Plugin` object, registered in `src/plugins.ts` through the
`PluginRegistrar` the framework passes in.

## Available Plugins

| Plugin | Factory | Description |
|--------|---------|-------------|
| [`jwt-auth`](./jwt-auth/) | `jwtAuth(options)` | JWT authentication (HS256/384/512, RS256/384/512, ES256/384/512) |
| [`session`](./session/) | `session(options)` | Cookie-based session management |
| [`api-key`](./api-key/) | `apiKey(options)` | API key authentication via a header |
| [`basic-auth`](./basic-auth/) | `basicAuth(options)` | HTTP Basic authentication |
| [`oidc`](./oidc/) | `oidc(options)` | OpenID Connect authentication |
| [`env`](./env/) | `env(options)` | Environment variable validation |

## Usage

Install via the CLI:

```bash
burger-api add jwt-auth
```

Or copy the plugin into `ecosystem/plugins/` manually and register it:

```typescript
// src/plugins.ts
import type { PluginRegistrar } from 'burger-api';
import { jwtAuth } from '../ecosystem/plugins/jwt-auth/jwt-auth';

export default function (burger: PluginRegistrar) {
    burger.usePlugin(jwtAuth({ secret: process.env.JWT_SECRET }));
}
```

`src/plugins.ts` is auto-discovered in dev. In production builds, pass it to
`new Burger({ pluginsModule })` (the CLI build does this for you). Never call
`burger.usePlugin()` from `index.ts`: plugin registration lives in
`src/plugins.ts`.

## Plugin Interface

Each factory returns a `Plugin` object:

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

A plugin declares its `name` and lifecycle hooks. For example, `apiKey()`
registers a `transform` that reads the key and a `beforeRoute` that enforces
it:

```typescript
burger.usePlugin(apiKey({ keys: ['demo-api-key-123'] }));
```

Registering the same plugin twice (same `name` plus seed) is ignored with a
warning. `usePlugin(plugin, scope?, seed?)` also accepts an optional scope
override and a seed for disambiguating multiple instances (for example, two
JWT plugins with different secrets).

## Hooks vs Plugins

- **Hooks** control request execution: `onRequest`, `transform`,
  `beforeRoute`, `afterRoute`, `mapResponse`, `onError`.
- **Plugins** extend the app and may register hooks, providers, or context
  types.

They are separate: hooks are the request lifecycle, plugins are application
extensions composed on top of them.

## Creating Plugins

```bash
burger-api generate plugin my-plugin
```

This creates `ecosystem/plugins/my-plugin/my-plugin.ts` with a minimal
template.

## Configuration Model

Plugins support two-tier configuration:

- **Global defaults** in `src/plugins.ts` when registering the plugin.
- **Route overrides** per route in `config.ts`.

Example: the JWT plugin is configured globally, and the admin route requires
an `admin` role:

```typescript
// src/plugins.ts
export default function (burger: PluginRegistrar) {
    burger.usePlugin(
        jwtAuth({ secret: process.env.JWT_SECRET, algorithm: 'HS256' })
    );
}

// src/api/admin/config.ts
export default {
    auth: { required: true, roles: ['admin'] },
};
```

Auth plugins default-deny unless a route sets `auth: false` (or
`auth: { required: false }`). See each plugin's README for its options.