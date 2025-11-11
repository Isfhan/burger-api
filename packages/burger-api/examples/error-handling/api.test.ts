/**
 * Test suite for error-handling example
 *
 * @file examples/error-handling/api.test.ts
 * @description Tests error handling, validation, and API endpoints
 *
 * Usage:
 *   1. Start the server: bun run examples/error-handling/index.ts
 *   2. In another terminal, run: bun test examples/error-handling/api.test.ts
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
        return response.status === 200 || response.status === 405;
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
                '  bun run examples/error-handling/index.ts\n\n' +
                'Then run the tests in another terminal:\n' +
                '  bun test examples/error-handling/api.test.ts'
        );
    }
    console.log('✅ Server is running, starting tests...\n');
});

describe('Error Handling Example', () => {
    describe('Products API', () => {
        describe('POST /api/products', () => {
            it('should create a product with valid data', async () => {
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
                expect(data.name).toBe('Test Product');
                expect(data.price).toBe(99.99);
            });

            it('should return validation error for missing name', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        price: 99.99,
                    }),
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });

            it('should return validation error for missing price', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'Test Product',
                    }),
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });

            it('should return validation error for invalid price (negative)', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'Test Product',
                        price: -10,
                    }),
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });

            it('should return validation error for empty name', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: '',
                        price: 99.99,
                    }),
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });

            it('should return validation error for invalid data types', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 123,
                        price: 'invalid',
                    }),
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
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
                expect(data.id).toBe(1);
                expect(data.name).toBe('Sample Product');
            });

            it('should return product with valid ID and query parameter', async () => {
                const data = await fetchJSON('/api/products/1?search=test');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('query');
                expect(data.id).toBe(1);
                expect(data.query).toHaveProperty('search');
                expect(data.query.search).toBe('test');
            });

            it('should return validation error for invalid ID (non-numeric)', async () => {
                const response = await fetchAPI('/api/products/invalid');
                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('params');
            });

            it('should return validation error for invalid ID (zero)', async () => {
                const response = await fetchAPI('/api/products/0');
                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('params');
            });

            it('should return validation error for invalid ID (negative)', async () => {
                const response = await fetchAPI('/api/products/-1');
                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('params');
            });

            it('should handle large valid IDs', async () => {
                const data = await fetchJSON('/api/products/999999');
                expect(data).toHaveProperty('id');
                expect(data.id).toBe(999999);
            });
        });

        describe('Error Handling', () => {
            it('should return 404 for non-existent route', async () => {
                const response = await fetchAPI(
                    '/api/products/nonexistent/route'
                );
                expect(response.status).toBe(404);
            });

            it('should return 405 for unsupported methods', async () => {
                const response = await fetchAPI('/api/products/detail', {
                    method: 'DELETE',
                });
                expect([404, 405]).toContain(response.status);
            });

            it('should handle malformed JSON gracefully', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: 'invalid json',
                });

                expect([400, 500]).toContain(response.status);
            });
        });
    });
});
