/**
 * Test suite for file-base-static-page-routing-app example
 *
 * @file examples/file-base-static-page-routing-app/api.test.ts
 * @description Tests API endpoints (static page routing is not tested here)
 *
 * Usage:
 *   1. Start the server: bun run examples/file-base-static-page-routing-app/index.ts
 *   2. In another terminal, run: bun test examples/file-base-static-page-routing-app/api.test.ts
 */

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
        healthPath: '/api/products/detail',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('File-Based Static Page Routing App Example', () => {
    describe('Products API', () => {
        describe('POST /api/products', () => {
            it('should create a product', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'Test Product',
                        price: 99.99,
                    }),
                });

                expect(response.status).toBe(200);
                const data = await response.json();
                expect(data).toHaveProperty('name');
                expect(data).toHaveProperty('price');
            });
        });

        describe('GET /api/products/detail', () => {
            it('should return product detail', async () => {
                const data = await fetchJSON('/api/products/detail');
                expect(data).toHaveProperty('name');
                expect(data.name).toBe('Sample Product');
            });
        });

        describe('GET /api/products/:id', () => {
            it('should return product with valid ID', async () => {
                const data = await fetchJSON('/api/products/1');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('name');
                expect(data).toHaveProperty('query');
                expect(data.id).toBe(1);
                expect(data.name).toBe('Sample Product');
            });

            it('should handle different numeric product IDs', async () => {
                const testIds = ['1', '2', '123'];
                for (const id of testIds) {
                    const data = await fetchJSON(`/api/products/${id}`);
                    expect(data).toHaveProperty('id');
                    expect(data.id).toBe(parseInt(id, 10));
                }
            });

            it('should return validation error for non-numeric ID', async () => {
                const response = await fetchAPI('/api/products/abc');
                expect(response.status).toBe(422);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
            });

            it('should handle query parameters with product ID', async () => {
                const data = await fetchJSON('/api/products/1?search=test');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('query');
                expect(data.id).toBe(1);
                expect(data.query).toHaveProperty('search');
            });
        });
    });

    describe('API and Static Pages Coexistence', () => {
        it('should handle API routes correctly', async () => {
            // Test POST endpoint (GET doesn't exist for /api/products)
            const response = await fetchAPI('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Test Product',
                    price: 99.99,
                }),
            });
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toHaveProperty('name');
        });

        it('should not interfere with static page routes', async () => {
            // API routes should work independently
            const data = await fetchJSON('/api/products/1');
            expect(data).toHaveProperty('id');
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent API routes', async () => {
            const response = await fetchAPI('/api/nonexistent');
            expect(response.status).toBe(404);
        });

        it('should return 404 for invalid nested API routes', async () => {
            const response = await fetchAPI('/api/products/invalid/nested');
            expect(response.status).toBe(404);
        });
    });
});
