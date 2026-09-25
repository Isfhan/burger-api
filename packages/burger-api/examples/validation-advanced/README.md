# Validation Advanced Example

Demonstrates coercion, named models, and response validation in BurgerAPI.

## Features

- **Coercion**: Automatic string-to-number conversion for query parameters (e.g. `?page=1` where `"1"` becomes `1`)
- **Named Models**: Reusable schema definitions registered via `ServerOptions.models` and referenced by string name in route schemas
- **Response Validation**: Declaring response schemas per status code; validated in dev mode (warns on mismatch)

## Running

```bash
bun run examples/validation-advanced/src/index.ts
```

## Testing

```bash
bun test examples/validation-advanced/api.test.ts
```

## Endpoints

| Method | Endpoint     | Description              |
|--------|-------------|--------------------------|
| GET    | `/api/items` | List items (paginated)   |
| POST   | `/api/items` | Create a new item        |

## Key Concepts

- `validation.coerce: true` enables app-wide coercion for query, params, headers, and cookies
- `ServerOptions.models` registers reusable schemas; reference them by string name in `schema.ts`
- `response: { '200': z.object({...}) }` declares per-status response schemas
- Per-method `coerce: true` in schema overrides app-wide setting
