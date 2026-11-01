# Compression Hook

Compresses response bodies with gzip or deflate when the client supports it.

## Features

- gzip and deflate encoding, chosen from `Accept-Encoding`
- Minimum-size threshold
- Content-type include and exclude filters
- Skips already compressed and bodiless responses
- Only uses the compressed body when it is smaller
- Sets `Content-Encoding` and `Vary: Accept-Encoding`

## Installation

```bash
burger-api add compression
```

## Usage

The hook returns a response transform, so wire it into `beforeRoute`.

```typescript
// src/hooks.ts
import { compress } from '../ecosystem/hooks/compression/compression';

export const beforeRoute = [compress()];
```

### Custom threshold

```typescript
export const beforeRoute = [
    compress({ threshold: 2048 }), // only responses larger than 2KB
];
```

### Restrict content types

```typescript
export const beforeRoute = [
    compress({
        contentTypes: /^(text\/|application\/(json|javascript|xml))/,
    }),
];
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `1024` | Minimum body size in bytes to compress |
| `encodings` | `('gzip' \| 'deflate' \| 'br')[]` | `['gzip', 'deflate']` | Supported encodings, in preference order |
| `contentTypes` | `string[] \| RegExp` | - | Only compress matching content types |
| `excludeContentTypes` | `string[] \| RegExp` | `['image/', 'video/', 'audio/', 'font/']` | Skip matching content types |

## How it works

1. Reads `Accept-Encoding` and picks the first configured encoding the client
   accepts.
2. Skips responses that already have `Content-Encoding`, have no body, or are
   `204`/`304`.
3. Skips excluded content types, and non-matching types when `contentTypes`
   is set.
4. Compresses the body and uses the result only if it is smaller than the
   original.
5. On compression, sets `Content-Encoding`, adds `Vary: Accept-Encoding`, and
   removes `Content-Length`.

## Brotli

This hook does not implement Brotli. If `'br'` is in `encodings` and the
client asks for it, compression is skipped with a warning and the response is
sent uncompressed. Because the first matching encoding wins, listing `'br'`
before `gzip` also shadows gzip for browsers. Keep the default
`['gzip', 'deflate']`.

## Notes

- Compression runs on the whole body, so very large streaming responses are
  buffered before they are sent.
- If a CDN in front of your app already compresses, disable this hook to
  avoid double compression.