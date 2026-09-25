# Environment Validation Plugin

Official environment variable validation plugin for BurgerAPI. Validates required environment variables on startup before the server starts.

## Features

- Type validation (string, number, boolean, URL, JSON)
- Custom validation functions
- Default values for optional variables
- Clear error messages with descriptions
- Custom error handlers

## Installation

```bash
burger-api add env
```

Or manually copy to `ecosystem/plugins/env/`.

## Usage

Register the plugin in `src/plugins.ts`. The module exports a default function
that receives the `Burger` instance:

```typescript
// src/plugins.ts
import type { PluginRegistrar } from "burger-api";
import { env } from "../ecosystem/plugins/env/env";

export default function (burger: PluginRegistrar) {
  burger.usePlugin(env({
    required: {
      DATABASE_URL: { type: "url" },
      JWT_SECRET: { type: "string" },
    },
    optional: {
      PORT: { type: "number", default: 3000 },
      LOG_LEVEL: { type: "string", default: "info" },
    },
  }));
}
```

### With custom validation

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(env({
    required: {
      API_KEY: {
        type: "string",
        validate: (value) => value.startsWith("sk_"),
        description: "API key must start with sk_",
      },
    },
  }));
}
```

### With custom error handler

```typescript
export default function (burger: PluginRegistrar) {
  burger.usePlugin(env({
    required: {
      DATABASE_URL: { type: "url" },
    },
    onError: (errors) => {
      console.error("Environment validation failed:");
      errors.forEach((error) => {
        console.error(`  ${error.name}: ${error.message}`);
      });
    },
  }));
}
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `required` | `Record<string, EnvSchema>` | `{}` | Required environment variables |
| `optional` | `Record<string, EnvSchema>` | `{}` | Optional environment variables with defaults |
| `throwOnError` | `boolean` | `true` | Throw on missing/invalid variables |
| `onError` | `(errors: EnvError[]) => void` | - | Custom error handler |

## Variable types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Any string | `"hello"` |
| `number` | Numeric value | `"42"`, `"3.14"` |
| `boolean` | Boolean value | `"true"`, `"false"`, `"yes"`, `"no"` |
| `url` | Valid URL | `"https://example.com"` |
| `json` | Valid JSON | `'{"key": "value"}'` |

## Error responses

The plugin throws an error with a clear message listing all missing/invalid variables:

```
Environment validation failed:
Missing: DATABASE_URL, JWT_SECRET
Invalid: PORT - Invalid environment variable: PORT must be a number, got "abc"
```

## Security notes

- Never commit `.env` files to version control
- Use `.env.example` to document required variables
- Consider using a secrets manager for production
- Validate URLs, JSON, and other complex types to catch configuration errors early
