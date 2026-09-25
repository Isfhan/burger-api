# API Key Auth Plugin

Official API key authentication plugin for BurgerAPI. Parses API key from header and validates against provided list or function.

## Features

- Configurable header name (default: X-API-Key)
- Static list validation
- Dynamic validation with custom functions
- Custom key extraction
- Optional context attachment

## Installation

```bash
burger-api add api-key
```

Or manually copy to `ecosystem/plugins/api-key/`.

## Usage

Register the plugin in `src/plugins.ts`. The module exports a default function
that receives the `Burger` instance:

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { apiKey } from "../ecosystem/plugins/api-key/api-key";

export default function (burger: PluginRegistrar) {
  burger.usePlugin(apiKey({
    keys: ["key1", "key2", "key3"],
  }));
}
```

At least one of `keys` (non-empty) or `validate` is required:
`apiKey()` with neither throws at startup instead of rejecting every
request with `401`. The check runs in the plugin's `beforeRoute` hook;
routes with `auth: false` skip it entirely.

### Dynamic validation

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(apiKey({
    validate: async (key) => {
      // Check against database
      const dbKey = await db.apiKeys.findByKey(key);
      return dbKey !== null;
    },
  }));
}
```

### Custom header

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(apiKey({
    header: "Authorization",
    keys: ["key1", "key2"],
  }));
}
```

### Custom extraction

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(apiKey({
    extract: (ctx) => {
      // Extract from query string
      const url = new URL(ctx.url);
      return url.searchParams.get("api_key");
    },
    keys: ["key1", "key2"],
  }));
}
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `"X-API-Key"` | Header name to extract API key from |
| `keys` | `string[]` | `[]` | Static list of valid API keys (or use `validate`) |
| `validate` | `(key: string) => Promise<boolean>` | - | Dynamic validation function (or use `keys`) |
| `extract` | `(ctx: BurgerContext) => string \| null` | - | Custom key extraction function |
| `attachToContext` | `boolean` | `true` | Attach API key info to context |

## Route configuration

### Disable auth for public routes

```typescript
// src/api/public/config.ts
export default {
  auth: false,
};
```

### Require API key

```typescript
// src/api/private/config.ts
export default {
  auth: {
    required: true,
  },
};
```

## Context properties

After successful validation, the API key is available as `ctx.apiKey`
(typed by the plugin's `declare module "burger-api"` augmentation — no cast
needed):

```typescript
import type { BurgerContext } from "burger-api";

export async function GET(ctx: BurgerContext) {
  return Response.json({ apiKey: ctx.apiKey });
}
```

## Error responses

- **401 Unauthorized** — Missing API key or invalid API key
- **Config error at startup** — Neither `keys` nor `validate` configured

## Security notes

- Use HTTPS in production
- Rotate API keys regularly
- Use environment variables or secrets manager for key storage
- Consider rate limiting for API key usage
- Log API key usage for auditing
