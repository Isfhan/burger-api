/**
 * Test suite for zod-based-schema-validation example
 *
 * @file examples/zod-based-schema-validation/api.test.ts
 * @description Tests Zod validation for query parameters and request body
 *
 * Usage:
 *   1. Start the server: bun run examples/zod-based-schema-validation/index.ts
 *   2. In another terminal, run: bun test examples/zod-based-schema-validation/api.test.ts
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
        healthPath: '/api/products?search=test',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('Zod-Based Schema Validation Example', () => {
    describe('Products API', () => {
        describe('GET /api/products', () => {
            it('should return products with valid query parameter', async () => {
                const data = await fetchJSON('/api/products?search=test');
                expect(data).toHaveProperty('query');
                expect(data).toHaveProperty('name');
                expect(data.query).toHaveProperty('search');
                expect(data.query.search).toBe('test');
                expect(data.name).toBe('John Doe');
            });

            it('should return validation error for missing search parameter', async () => {
                const response = await fetchAPI('/api/products');
                expect(response.status).toBe(422);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('query');
            });

            it('should handle empty search parameter', async () => {
                // Empty string is valid for z.string() (no min length requirement)
                const data = await fetchJSON('/api/products?search=');
                expect(data).toHaveProperty('query');
                expect(data.query).toHaveProperty('search');
                expect(data.query.search).toBe('');
            });

            it('should handle search with special characters', async () => {
                const data = await fetchJSON(
                    '/api/products?search=test%20product'
                );
                expect(data.query.search).toBe('test product');
            });

            it('should handle search with multiple words', async () => {
                const data = await fetchJSON(
                    '/api/products?search=test+product+search'
                );
                expect(data.query.search).toBe('test product search');
            });
        });

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

                expect(response.status).toBe(422);
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

                expect(response.status).toBe(422);
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

                expect(response.status).toBe(422);
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

                expect(response.status).toBe(422);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });

            it('should return validation error for invalid price (zero)', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'Test Product',
                        price: 0,
                    }),
                });

                expect(response.status).toBe(422);
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

                expect(response.status).toBe(422);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });

            it('should handle valid product with decimal price', async () => {
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
                expect(data.price).toBe(99.99);
            });
        });

        describe('GET /api/products/:id', () => {
            it('should return product with valid ID', async () => {
                const data = await fetchJSON('/api/products/1');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('name');
                expect(data.id).toBe('1'); // ID is validated as string, not number
            });

            it('should handle non-numeric ID (string validation allows any non-empty string)', async () => {
                // The schema only requires z.string().min(1), so any non-empty string is valid
                const data = await fetchJSON('/api/products/invalid');
                expect(data).toHaveProperty('id');
                expect(data.id).toBe('invalid');
            });

            it('should handle ID as zero (string validation allows it)', async () => {
                // The schema only requires z.string().min(1), so "0" is valid
                const data = await fetchJSON('/api/products/0');
                expect(data).toHaveProperty('id');
                expect(data.id).toBe('0');
            });

            it('should handle negative ID (string validation allows it)', async () => {
                // The schema only requires z.string().min(1), so "-1" is valid
                const data = await fetchJSON('/api/products/-1');
                expect(data).toHaveProperty('id');
                expect(data.id).toBe('-1');
            });
        });

        describe('Validation Edge Cases', () => {
            it('should handle very long search strings', async () => {
                const longSearch = 'a'.repeat(1000);
                const data = await fetchJSON(
                    `/api/products?search=${longSearch}`
                );
                expect(data.query.search).toBe(longSearch);
            });

            it('should handle special characters in search', async () => {
                const data = await fetchJSON(
                    '/api/products?search=test%21%40%23'
                );
                expect(data.query.search).toBe('test!@#');
            });

            it('should handle unicode characters in product name', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'Test Product 🚀',
                        price: 99.99,
                    }),
                });

                expect(response.status).toBe(200);
                const data = await response.json();
                expect(data.name).toBe('Test Product 🚀');
            });
        });
    });
});
