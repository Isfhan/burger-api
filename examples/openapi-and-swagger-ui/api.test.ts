/**
 * Test suite for openapi-and-swagger-ui example
 *
 * @file examples/openapi-and-swagger-ui/api.test.ts
 * @description Tests API endpoints, OpenAPI spec, and Swagger UI
 *
 * Usage:
 *   1. Start the server: bun run examples/openapi-and-swagger-ui/index.ts
 *   2. In another terminal, run: bun test examples/openapi-and-swagger-ui/api.test.ts
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
        // Check if server is running by trying to access OpenAPI spec
        const response = await fetchAPI('/openapi.json');
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
                '  bun run examples/openapi-and-swagger-ui/index.ts\n\n' +
                'Then run the tests in another terminal:\n' +
                '  bun test examples/openapi-and-swagger-ui/api.test.ts'
        );
    }
    console.log('✅ Server is running, starting tests...\n');
});

describe('OpenAPI and Swagger UI Example', () => {
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

            it('should return validation error for invalid data', async () => {
                const response = await fetchAPI('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: '',
                        price: -10,
                    }),
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('body');
            });
        });

        describe('GET /api/products/:id', () => {
            it('should return product with valid ID', async () => {
                const data = await fetchJSON('/api/products/1');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('query');
                expect(data).toHaveProperty('name');
                expect(data.id).toBe(1);
                expect(data.name).toBe('Sample Product');
            });

            it('should handle query parameters with product ID', async () => {
                const data = await fetchJSON('/api/products/1?search=test');
                expect(data).toHaveProperty('id');
                expect(data).toHaveProperty('query');
                expect(data.query).toHaveProperty('search');
                expect(data.query.search).toBe('test');
            });

            it('should return validation error for invalid ID', async () => {
                const response = await fetchAPI('/api/products/invalid');
                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data).toHaveProperty('errors');
                expect(data.errors).toHaveProperty('params');
            });
        });
    });

    describe('OpenAPI Documentation', () => {
        describe('GET /openapi.json', () => {
            it('should return OpenAPI specification', async () => {
                const data = await fetchJSON('/openapi.json');
                expect(data).toHaveProperty('openapi');
                expect(data).toHaveProperty('info');
                expect(data).toHaveProperty('paths');
                expect(data.info).toHaveProperty('title');
                expect(data.info).toHaveProperty('version');
            });

            it('should include API paths in OpenAPI spec', async () => {
                const data = await fetchJSON('/openapi.json');
                expect(data.paths).toHaveProperty('/api/products');
                expect(data.paths).toHaveProperty('/api/products/{id}');
            });

            it('should include operation metadata', async () => {
                const data = await fetchJSON('/openapi.json');
                const productsPath = data.paths['/api/products'];
                expect(productsPath).toHaveProperty('post');
                expect(productsPath.post).toHaveProperty('summary');
                expect(productsPath.post).toHaveProperty('description');
                expect(productsPath.post).toHaveProperty('tags');
                expect(productsPath.post).toHaveProperty('operationId');
            });

            it('should include request body schema', async () => {
                const data = await fetchJSON('/openapi.json');
                const productsPath = data.paths['/api/products'];
                expect(productsPath.post).toHaveProperty('requestBody');
                expect(productsPath.post.requestBody).toHaveProperty('content');
            });

            it('should include parameter schemas', async () => {
                const data = await fetchJSON('/openapi.json');
                const productIdPath = data.paths['/api/products/{id}'];
                expect(productIdPath.get).toHaveProperty('parameters');
                expect(Array.isArray(productIdPath.get.parameters)).toBe(true);
            });
        });

        describe('GET /docs', () => {
            it('should return Swagger UI HTML', async () => {
                const response = await fetchAPI('/docs');
                expect(response.status).toBe(200);
                expect(response.headers.get('Content-Type')).toContain(
                    'text/html'
                );
                const html = await response.text();
                expect(html).toContain('swagger-ui');
                expect(html).toContain('openapi.json');
            });

            it('should include Swagger UI configuration', async () => {
                const response = await fetchAPI('/docs');
                const html = await response.text();
                expect(html).toContain('SwaggerUIBundle');
                expect(html).toContain('/openapi.json');
            });
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
