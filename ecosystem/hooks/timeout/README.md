# Timeout Hook

Request timeouts for burger-api. Two exports:

| Export | Where | Responds at the deadline | Default status |
|--------|-------|--------------------------|----------------|
| `withTimeout(handler, options)` | wraps a handler in `route.ts` | Yes, exactly at `ms` | `504 Gateway Timeout` |
| `requestTimeout(options)` | hook in `src/hooks.ts` or a route's `hooks.ts` | No, replaces a late response after the handler finishes | `408 Request Timeout` |

Use `withTimeout` when the client must get an answer at the deadline. Use
`requestTimeout` as a coarse, app-wide budget check.

## Installation

```bash
burger-api add timeout
```

## Usage

### Respond at the deadline (`withTimeout`)

```typescript
// src/api/report/route.ts
import { withTimeout } from '../../../ecosystem/hooks/timeout/timeout';

export const GET = withTimeout(async (ctx, signal) => {
    // Pass the signal to anything that accepts one, so the work stops too.
    const res = await fetch('https://slow.example.com/data', { signal });
    return Response.json(await res.json());
}, { ms: 5000 });
```

`signal` aborts at the deadline or when the client disconnects. JavaScript
cannot cancel a running function: after the `504` is sent, the handler keeps
running unless it observes the signal. Its eventual result is discarded; a
late error is logged.

### Guard hook (`requestTimeout`)

```typescript
// src/hooks.ts
import { requestTimeout } from '../ecosystem/hooks/timeout/timeout';

export const beforeRoute = [requestTimeout({ ms: 30000 })];
```

Hooks run before and after the handler but cannot wrap it. The client waits
for the slow handler, then receives a `408` instead of its response. The hook
must be in `beforeRoute` (or `onRequest`) to cover the handler.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ms` | `number` | `30000` | Timeout in milliseconds |
| `message` | `string` | `'Request timeout'` | `message` field of the default JSON body |
| `onTimeout` | `() => Response` | `504` JSON for `withTimeout`, `408` JSON for the hook | Custom timeout response |

Default bodies:

```json
{ "error": "Gateway Timeout", "message": "Request timeout" }
```

```json
{ "error": "Request Timeout", "message": "Request timeout" }
```

### Custom response

```typescript
export const GET = withTimeout(handler, {
    ms: 10000,
    onTimeout: () =>
        Response.json(
            { error: 'Timeout' },
            { status: 504, headers: { 'Retry-After': '60' } }
        ),
});
```

## Notes

- Reverse proxies (nginx, load balancers) have their own timeouts. Keep `ms`
  below theirs so clients see your response.
- For work that legitimately takes minutes, return `202 Accepted` and run it
  as a background job.