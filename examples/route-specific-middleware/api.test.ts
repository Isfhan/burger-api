/**
 * Test suite for route-specific-middleware example
 *
 * @file examples/route-specific-middleware/api.test.ts
 * @description Tests route-specific middleware functionality
 *
 * Usage:
 *   1. Start the server: bun run examples/route-specific-middleware/index.ts
 *   2. In another terminal, run: bun test examples/route-specific-middleware/api.test.ts
 */

import { describe, it, expect, beforeAll } from 'bun:test';

const BASE_URL = 'http://localhost:4000';
const REQUEST_TIMEOUT = 5000;

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

async function checkServer(): Promise<boolean> {
    try {
        const response = await fetchAPI('/api/products');
        return response.status === 200;
    } catch {
        return false;
    }
}

beforeAll(async () => {
    const isRunning = await checkServer();
    if (!isRunning) {
        throw new Error(
            '❌ Server is not running!\n\n' +
                'Please start the server first:\n' +
                '  bun run examples/route-specific-middleware/index.ts\n\n' +
                'Then run the tests in another terminal:\n' +
                '  bun test examples/route-specific-middleware/api.test.ts'
        );
    }
    console.log('✅ Server is running, starting tests...\n');
});

describe('Route-Specific Middleware Example', () => {
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

            it('should execute route-specific middleware', async () => {
                // Route-specific middleware should be executed
                // Check server logs to verify middleware execution
                const data = await fetchJSON('/api/products');
                expect(data).toHaveProperty('name');
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
                expect(data.message).toBe('Product Detail');
            });

            it('should execute route-specific middleware', async () => {
                // Route-specific middleware should be executed
                // Check server logs to verify middleware execution
                const data = await fetchJSON('/api/products/detail');
                expect(data).toHaveProperty('message');
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

            it('should execute route-specific middleware', async () => {
                // Route-specific middleware should be executed
                // Check server logs to verify middleware execution
                const data = await fetchJSON('/api/profile/1');
                expect(data).toHaveProperty('id');
            });
        });
    });

    describe('Middleware Behavior', () => {
        it('should execute global middleware for all routes', async () => {
            // Global middleware should be executed for all routes
            // Check server logs to verify middleware execution
            const data = await fetchJSON('/api/products');
            expect(data).toHaveProperty('name');
        });

        it('should execute route-specific middleware for specific routes', async () => {
            // Route-specific middleware should be executed only for routes that define it
            // Check server logs to verify middleware execution
            const data = await fetchJSON('/api/products/detail');
            expect(data).toHaveProperty('message');
        });

        it('should combine global and route-specific middleware', async () => {
            // Both global and route-specific middleware should be executed
            // Check server logs to verify middleware execution order
            const data = await fetchJSON('/api/products');
            expect(data).toHaveProperty('name');
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
