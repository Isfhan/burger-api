# Timeout

Request timeouts for burger-api. Two exports:

| Export | Where | Responds at the deadline? | Default status |
|--------|-------|---------------------------|----------------|
| `withTimeout(handler, options)` | wraps a handler in `route.ts` | ✅ Yes — exactly at `ms` | `504 Gateway Timeout` |
| `requestTimeout(options)` | hook (`src/hooks.ts` or a route's `hooks.ts`) | ❌ No — replaces a **late** response after the handler finishes | `408 Request Timeout` |

Use `withTimeout` when the client must get an answer at the deadline: the
server responds `504 Gateway Timeout` at `ms`, and the handler is told to
stop via an `AbortSignal`. `requestTimeout` is a coarse guard hook — it
cannot interrupt the handler, so the client still waits and only then gets
a `408` instead of the late response.

## Installation

```bash
burger-api add timeout
```

## Usage

### Basic Usage — respond at the deadline (`withTimeout`)

```typescript
// src/api/report/route.ts
import { withTimeout } from '../../../ecosystem/hooks/timeout/timeout';

export const GET = withTimeout(async (ctx, signal) => {
    // Pass `signal` to anything that accepts one so the work stops too
    const res = await fetch('https://slow.example.com/data', { signal });
    return Response.json(await res.json());
}, { ms: 5000 });
```

`ctx` is a `BurgerContext`; `signal` is an `AbortSignal` that aborts at the
deadline or when the client disconnects.

> ⚠️ **The handler is not cancelled.** JavaScript cannot stop a running
> function. After the 504 is sent the handler keeps running in the
> background unless it observes `signal` (passes it to `fetch`, a DB driver,
> or checks `signal.aborted` between steps). Its eventual result is
> discarded; a late error is logged with `console.error`.

### Guard hook (`requestTimeout`)

```typescript
// src/hooks.ts
import { requestTimeout } from '../ecosystem/hooks/timeout/timeout';

export const beforeRoute = [requestTimeout({ ms: 30000 })];
```

Hooks run *before* and *after* the handler but cannot wrap it, so this hook
can only check the elapsed time once the handler has finished: the client
still waits for the slow handler, then receives a `408` instead of its
response. Use it as a coarse app-wide budget / safety net; use
`withTimeout` on routes where the client must get an answer at the deadline.

**Recommended stage:** `beforeRoute` (global or route `hooks.ts`), so the
budget covers the handler.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ms` | `number` | `30000` | Timeout in milliseconds |
| `message` | `string` | `'Request timeout'` | `message` field of the default 504 body |
| `onTimeout` | `() => Response` | `504` JSON for `withTimeout`, `408` JSON for the hook | Custom timeout response |

Default responses:

```http
# withTimeout
HTTP/1.1 504 Gateway Timeout
Content-Type: application/json

{"error":"Gateway Timeout","message":"Request timeout"}
```

```http
# requestTimeout (sent after the handler finishes)
HTTP/1.1 408 Request Timeout
Content-Type: application/json

{"error":"Request Timeout","message":"Request timeout"}
```

## Custom Error Response

```typescript
export const GET = withTimeout(handler, {
    ms: 10000,
    onTimeout: () =>
        Response.json(
            { error: 'Timeout', message: 'Try again later' },
            { status: 504, headers: { 'Retry-After': '60' } }
        ),
});
```

## Testing with curl

```typescript
// src/api/slow/route.ts
import { withTimeout } from '../../../ecosystem/hooks/timeout/timeout';

export const GET = withTimeout(async () => {
    await Bun.sleep(5000);
    return Response.json({ done: true });
}, { ms: 1000 });
```

```bash
curl -i http://localhost:4000/api/slow   # 504 after ~1s, not 5s
```

## Notes

- Reverse proxies (nginx, load balancers) have their own timeouts — keep
  `ms` below them so clients see your 504 body.
- For work that legitimately takes minutes, return `202 Accepted` and run it
  as a background job instead of raising the timeout.
