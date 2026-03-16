/**
 * Test suite for file-base-api-routing example
 *
 * @file examples/file-base-api-routing/api.test.ts
 * @description Tests file-based API routing with groups and dynamic routes
 *
 * Usage:
 *   1. Start the server: bun run examples/file-base-api-routing/index.ts
 *   2. In another terminal, run: bun test examples/file-base-api-routing/api.test.ts
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
        healthPath: '/api/products',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('File-Based API Routing Example', () => {
    describe('Products API', () => {
        describe('GET /api/products', () => {
            it('should return products list', async () => {
                const data = await fetchJSON('/api/products');
                expect(data).toHaveProperty('query');
                expect(data).toHaveProperty('name');
                expect(data.name).toBe('John Doe');
            });

            it('should handle query parameters', async () => {
                const data = await fetchJSON('/api/products?search=test');
                expect(data.query).toHaveProperty('search');
                expect(data.query.search).toBe('test');
            });
        });

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
                expect(data).toHaveProperty('message');
                expect(data).toHaveProperty('productId');
                expect(data.message).toBe('Product Detail');
                expect(data.productId).toBe('123');
            });
        });
    });

    describe('Profile API', () => {
        describe('GET /api/profile/:id', () => {
            it('should return profile with valid ID', async () => {
                const data = await fetchJSON('/api/profile/1');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('name');
                expect(data.id).toBe('1');
                expect(data.name).toBe('John Doe');
            });

            it('should handle different profile IDs', async () => {
                const testIds = ['1', '2', '123', 'abc'];
                for (const id of testIds) {
                    const data = await fetchJSON(`/api/profile/${id}`);
                    expect(data).toHaveProperty('id');
                    expect(data.id).toBe(id);
                }
            });

            it('should handle profile ID with special characters', async () => {
                const data = await fetchJSON('/api/profile/test-123');
                expect(data).toHaveProperty('id');
                expect(data.id).toBe('test-123');
            });
        });
    });

    describe('Route Groups', () => {
        it('should handle grouped routes correctly', async () => {
            // Groups (folders with parentheses) are ignored in the route path
            const productsData = await fetchJSON('/api/products');
            expect(productsData).toHaveProperty('name');

            const profileData = await fetchJSON('/api/profile/1');
            expect(profileData).toHaveProperty('id');
        });

        it('should not include group name in route path', async () => {
            // Route should be /api/products, not /api/(group)/products
            const response = await fetchAPI('/api/(group)/products');
            expect(response.status).toBe(404);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const response = await fetchAPI('/api/nonexistent');
            expect(response.status).toBe(404);
        });

        it('should return 404 for invalid nested routes', async () => {
            const response = await fetchAPI('/api/products/invalid/nested');
            expect(response.status).toBe(404);
        });
    });
});
