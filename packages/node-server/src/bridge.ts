import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Bridges `node:http` to `toFetchHandler`: converts an `IncomingMessage`
 * into a Fetch API `Request`, and writes a `Response` back onto a
 * `ServerResponse`.
 */

/** Host or host:port; brackets allow an IPv6 literal such as `[::1]:3000`. */
const HOST_PATTERN =
    /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._~-]+)(?::\d{1,5})?$/;

/** A malformed `Host` header; the server maps this to a 400, not a 500. */
export class InvalidHostError extends Error {
    readonly status = 400;

    constructor(host: string) {
        super(`Invalid Host header: ${JSON.stringify(host)}`);
        this.name = 'InvalidHostError';
    }
}

/** Path + query from either origin-form (`/x`) or absolute-form (`http://h/x`). */
function requestTarget(rawUrl: string | undefined): string {
    const target = rawUrl ?? '/';
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(target)) {
        const parsed = new URL(target);
        return `${parsed.pathname}${parsed.search}`;
    }
    return target.startsWith('/') ? target : `/${target}`;
}

/**
 * Converts a `node:http` request into a Fetch API `Request`.
 *
 * The URL is built from the request target, never from `Host` (a path in that
 * header must not choose the route). Passing `res` aborts the request signal
 * when the client disconnects before the response finishes.
 */
export function toWebRequest(
    req: IncomingMessage,
    res?: ServerResponse
): Request {
    const hostHeader = req.headers.host;
    const host = hostHeader ?? 'localhost';
    if (!HOST_PATTERN.test(host)) throw new InvalidHostError(host);

    const protocol = (req.socket as { encrypted?: boolean }).encrypted
        ? 'https'
        : 'http';
    const url = `${protocol}://${host}${requestTarget(req.url)}`;

    const controller = new AbortController();
    if (res) {
        res.once('close', () => {
            if (!res.writableFinished) controller.abort();
        });
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
        } else {
            headers.set(key, value);
        }
    }

    const method = req.method ?? 'GET';
    // A body exists only when the client framed one: a positive
    // Content-Length or any Transfer-Encoding. Otherwise `body` stays null.
    const hasBody =
        method !== 'GET' &&
        method !== 'HEAD' &&
        (req.headers['transfer-encoding'] !== undefined ||
            Number(req.headers['content-length']) > 0);

    return new Request(url, {
        method,
        headers,
        signal: controller.signal,
        duplex: hasBody ? 'half' : undefined,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    });
}

/** Writes a Fetch API `Response` back onto a `node:http` `ServerResponse`. */
export async function sendWebResponse(
    res: ServerResponse,
    response: Response
): Promise<void> {
    res.statusCode = response.status;
    res.statusMessage = response.statusText;
    response.headers.forEach((value, key) => {
        // Set-Cookie is the one header that must stay a list.
        if (key !== 'set-cookie') res.setHeader(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);

    // HEAD never sends a body: cancel it so a stream stops producing.
    if (res.req?.method === 'HEAD') {
        if (response.body) void response.body.cancel().catch(() => {});
        res.end();
        return;
    }

    if (!response.body) {
        res.end();
        return;
    }

    const nodeStream = Readable.fromWeb(response.body as never);
    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            res.off('close', onClose);
            res.off('finish', onFinish);
            res.off('error', onError);
            nodeStream.off('error', onError);
        };
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn();
        };
        const onFinish = () => finish(resolve);
        const onError = (error: Error) => finish(() => reject(error));
        const onClose = () => {
            if (res.writableFinished) return finish(resolve);
            // Client left before the body finished: stop pulling the source.
            nodeStream.destroy();
            void response.body?.cancel().catch(() => {});
            finish(resolve);
        };
        nodeStream.on('error', onError);
        res.on('finish', onFinish);
        res.on('error', onError);
        res.on('close', onClose);
        nodeStream.pipe(res);
    });
}
