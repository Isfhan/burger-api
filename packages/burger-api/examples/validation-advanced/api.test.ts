import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../test-utils/example-server';

let BASE_URL = 'http://localhost:0';
const REQUEST_TIMEOUT = 5000;
let testServer: RunningExampleServer | null = null;

async function fetchAPI(
    path: string,
    options: RequestInit = {}
): Promise<Response> {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function fetchJSON<T = any>(path: string): Promise<T> {
    const response = await fetchAPI(path);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return response.json();
}

beforeAll(async () => {
    testServer = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api/items?page=1&limit=10',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('Validation Advanced Example', () => {
    describe('Coercion', () => {
        it('should coerce string query params to numbers', async () => {
            const data = await fetchJSON('/api/items?page=1&limit=10');
            expect(data.page).toBe(1);
            expect(data.limit).toBe(10);
            expect(typeof data.page).toBe('number');
            expect(typeof data.limit).toBe('number');
        });

        it('should use default values for optional coerced params', async () => {
            const data = await fetchJSON('/api/items');
            expect(data.page).toBe(1);
            expect(data.limit).toBe(10);
        });

        it('should reject non-numeric string for page', async () => {
            const response = await fetchAPI('/api/items?page=abc');
            expect(response.status).toBe(422);
        });
    });

    describe('Body Validation', () => {
        it('should accept valid body', async () => {
            const response = await fetchAPI('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Cola', price: 2.99 }),
            });
            expect(response.status).toBe(201);
            const data = await response.json();
            expect(data.name).toBe('Cola');
            expect(data.price).toBe(2.99);
            expect(data.id).toBeNumber();
        });

        it('should reject body with missing name', async () => {
            const response = await fetchAPI('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price: 2.99 }),
            });
            expect(response.status).toBe(422);
        });

        it('should reject body with negative price', async () => {
            const response = await fetchAPI('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Cola', price: -1 }),
            });
            expect(response.status).toBe(422);
        });
    });

    describe('Server', () => {
        it('should start and respond to requests', async () => {
            const response = await fetchAPI('/api/items?page=1&limit=1');
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.items).toBeArrayOfSize(1);
        });
    });
});
