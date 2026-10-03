/**
 * `notFound()` must hand out an independent `Response` per call. A cached
 * template's body stream can be locked once served (workerd), so cloning it
 * on the next request threw and turned 404s into 500s.
 */
import { describe, it, expect } from 'bun:test';
import { notFound } from '../../src/utils/response';

describe('notFound', () => {
    it('returns a fresh, readable 404 every call', async () => {
        const first = notFound();
        expect(first.status).toBe(404);
        expect(first.headers.get('content-type')).toContain(
            'application/problem+json'
        );
        expect(await first.json()).toEqual({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'Not Found',
        });

        // A second call stays usable after the first response was consumed.
        const second = notFound();
        expect(second).not.toBe(first);
        expect(await second.json()).toEqual({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'Not Found',
        });
    });

    it('keeps working when a served response body was locked by a reader', async () => {
        const served = notFound();
        const reader = served.body!.getReader();
        await reader.read();
        reader.releaseLock();

        const next = notFound();
        expect(next.status).toBe(404);
        expect(await next.text()).toContain('Not Found');
    });
});
