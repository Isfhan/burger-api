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
        healthPath: '/api/products',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('openapi-config example', () => {
    it('returns products list', async () => {
        const res = await fetch(`${server!.baseUrl}/api/products`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.products.length).toBeGreaterThan(0);
    });

    it('serves openapi.json with custom metadata', async () => {
        const res = await fetch(`${server!.baseUrl}/openapi.json`);
        expect(res.status).toBe(200);
        const spec = await res.json();
        expect(spec.info.title).toBe('Product API');
        expect(spec.info.version).toBe('1.0.0');
        expect(spec.info.contact.email).toBe('support@example.com');
    });

    it('protects docs with basic auth', async () => {
        const noAuth = await fetch(`${server!.baseUrl}/docs`);
        expect(noAuth.status).toBe(401);

        const auth = 'Basic ' + btoa('admin:secret');
        const withAuth = await fetch(`${server!.baseUrl}/docs`, {
            headers: { Authorization: auth },
        });
        expect(withAuth.status).toBe(200);
    });
});
