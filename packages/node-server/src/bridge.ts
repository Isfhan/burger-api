import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Bridges `node:http` to `toFetchHandler`: converts an `IncomingMessage`
 * into a Fetch API `Request`, and writes a `Response` back onto a
 * `ServerResponse`.
 */

/** Converts a `node:http` request into a Fetch API `Request`. */
export function toWebRequest(req: IncomingMessage): Request {
    const host = req.headers.host ?? 'localhost';
    const protocol = (req.socket as { encrypted?: boolean }).encrypted
        ? 'https'
        : 'http';
    const url = `${protocol}://${host}${req.url ?? '/'}`;

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
    const hasBody = method !== 'GET' && method !== 'HEAD';

    return new Request(url, {
        method,
        headers,
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
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (!response.body) {
        res.end();
        return;
    }

    const nodeStream = Readable.fromWeb(response.body as never);
    await new Promise<void>((resolve, reject) => {
        nodeStream.pipe(res);
        nodeStream.on('error', reject);
        res.on('finish', resolve);
        res.on('error', reject);
    });
}
