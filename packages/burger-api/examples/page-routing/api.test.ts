import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../test-utils/example-server';

let server: RunningExampleServer | null = null;

beforeAll(async () => {
    server = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/about',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('page-routing example', () => {
    it('serves the index page at /', async () => {
        const res = await fetch(`${server!.baseUrl}/`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<h1>Home</h1>');
    });

    it('serves a static HTML page at /about', async () => {
        const res = await fetch(`${server!.baseUrl}/about`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<h1>About</h1>');
    });

    it('serves a group-folded page (group is URL-ignored)', async () => {
        const res = await fetch(`${server!.baseUrl}/landing`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<h1>Landing</h1>');
    });

    it('serves a dynamic TSX page with params', async () => {
        const res = await fetch(`${server!.baseUrl}/blog/hello-world`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<h1>Blog: hello-world</h1>');
    });

    it('serves a nested static page', async () => {
        const res = await fetch(`${server!.baseUrl}/docs/guides/getting-started`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<h1>Getting Started</h1>');
    });

    it('returns 404 for non-existent pages', async () => {
        const res = await fetch(`${server!.baseUrl}/nonexistent`);
        expect(res.status).toBe(404);
    });
});
