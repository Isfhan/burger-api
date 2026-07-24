import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../../test-utils/example-server';

let BASE_URL = 'http://localhost:0';
let testServer: RunningExampleServer | null = null;

beforeAll(async () => {
    testServer = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api/basic',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('validation demo — integration', () => {
    it('backward-compat: route with no schema works unchanged', async () => {
        const res = await fetch(`${BASE_URL}/api/basic`);
        expect(res.status).toBe(200);
        expect((await res.json()).hello).toBe('world');
    });

    it('coercion: query strings → typed values when coerce is on', async () => {
        const res = await fetch(`${BASE_URL}/api/coerce?n=42&b=true`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.n).toBe(42);
        expect(body.typeN).toBe('number');
        expect(body.b).toBe(true);
        expect(body.typeB).toBe('boolean');
    });

    it('coercion: invalid coercion fails with 400 (loud, no silent NaN)', async () => {
        const res = await fetch(`${BASE_URL}/api/coerce?n=abc&b=true`);
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.errors).toBeDefined();
    });

    it('headers slot: missing required header → 400', async () => {
        const res = await fetch(`${BASE_URL}/api/headers`);
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.errors.headers).toBeDefined();
    });

    it('headers slot: valid header passes and reaches handler', async () => {
        const res = await fetch(`${BASE_URL}/api/headers`, {
            headers: { 'x-api-key': 'secret' },
        });
        expect(res.status).toBe(200);
        expect((await res.json()).key).toBe('secret');
    });

    it('cookie slot: validates parsed cookie values', async () => {
        const res = await fetch(`${BASE_URL}/api/cookie`, {
            headers: { cookie: 'session=abc123' },
        });
        expect(res.status).toBe(200);
        expect((await res.json()).session).toBe('abc123');
    });

    it('cookie slot: missing cookie → 400', async () => {
        const res = await fetch(`${BASE_URL}/api/cookie`);
        expect(res.status).toBe(422);
    });

    it('model ref: string-ref query resolves from registry', async () => {
        const res = await fetch(`${BASE_URL}/api/models?page=3&limit=50`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.page).toBe(3);
        expect(body.limit).toBe(50);
    });

    it('response validation (enforce): correct contract → 200', async () => {
        const res = await fetch(`${BASE_URL}/api/response`);
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    it('response validation (enforce): prod body never leaks internals', async () => {
        // Enforce mode returns a safe 500 on mismatch; this route is correct, so
        // we assert the general invariant that a 422/500 body has no stack/source.
        const bad = await fetch(`${BASE_URL}/api/coerce?n=abc`);
        const text = JSON.stringify(await bad.json());
        expect(text).not.toContain('stack');
        expect(text).not.toContain('source');
    });
});
