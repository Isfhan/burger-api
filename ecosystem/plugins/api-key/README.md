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
import type { Burger } from "burger-api";
import { apiKey } from "../ecosystem/plugins/api-key/api-key";

export default function (burger: Burger) {
  burger.usePlugin(apiKey({
    keys: ["key1", "key2", "key3"],
  }));
}
```

### Dynamic validation

```typescript
export default function (burger: Burger) {
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
export default function (burger: Burger) {
  burger.usePlugin(apiKey({
    header: "Authorization",
    keys: ["key1", "key2"],
  }));
}
```

### Custom extraction

```typescript
export default function (burger: Burger) {
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
| `keys` | `string[]` | `[]` | Static list of valid API keys |
| `validate` | `(key: string) => Promise<boolean>` | - | Dynamic validation function |
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

After successful validation, the API key is available as `ctx.apiKey`:

```typescript
export async function GET(ctx: BurgerContext) {
  const apiKey = ctx.apiKey as string;
  return Response.json({ apiKey });
}
```

## Error responses

- **401 Unauthorized** — Missing API key or invalid API key

## Security notes

- Use HTTPS in production
- Rotate API keys regularly
- Use environment variables or secrets manager for key storage
- Consider rate limiting for API key usage
- Log API key usage for auditing
