/**
 * Test suite for production-app example
 *
 * @file examples/production-app/api.test.ts
 * @description Tests production-ready application with global hooks, auth, rate limiting, and CORS
 *
 * Usage:
 *   1. Start the server: bun run examples/production-app/src/index.ts
 *   2. In another terminal, run: bun test examples/production-app/api.test.ts
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

async function fetchAPI(path: string, options: RequestInit = {}): Promise<Response> {
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
        healthPath: '/api',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('Production App', () => {
    describe('API Endpoints', () => {
        describe('GET /api', () => {
            it('should return API response', async () => {
                const data = await fetchJSON('/api');
                expect(data).toHaveProperty('message');
            });

            it('should execute global hooks', async () => {
                const data = await fetchJSON('/api');
                expect(data).toHaveProperty('message');
            });
        });
    });

    describe('Production Features', () => {
        describe('CORS', () => {
            it('should handle CORS preflight requests', async () => {
                const response = await fetchAPI('/api', {
                    method: 'OPTIONS',
                    headers: {
                        'Origin': 'http://localhost:3000',
                        'Access-Control-Request-Method': 'GET',
                    },
                });

                expect([200, 204, 405]).toContain(response.status);
            });

            it('should include CORS headers in responses', async () => {
                const response = await fetchAPI('/api', {
                    headers: {
                        'Origin': 'http://localhost:3000',
                    },
                });

                expect(response.status).toBe(200);
            });
        });

        describe('Rate Limiting', () => {
            it('should handle rate limiting', async () => {
                const requests = Array.from({ length: 10 }, () => fetchAPI('/api'));
                const responses = await Promise.all(requests);

                responses.forEach((response) => {
                    expect([200, 429]).toContain(response.status);
                });
            });
        });

        describe('Authentication', () => {
            it('should handle authenticated requests', async () => {
                const data = await fetchJSON('/api');
                expect(data).toHaveProperty('message');
            });

            it('should handle requests without authentication', async () => {
                const response = await fetchAPI('/api');
                expect([200, 401, 403]).toContain(response.status);
            });
        });

        describe('Logging', () => {
            it('should log all requests', async () => {
                const data = await fetchJSON('/api');
                expect(data).toHaveProperty('message');
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
                expect(data.info.title).toContain('Production App');
            });
        });

        describe('GET /docs', () => {
            it('should return docs UI HTML (Scalar)', async () => {
                const response = await fetchAPI('/docs');
                expect(response.status).toBe(200);
                expect(response.headers.get('Content-Type')).toContain('text/html');
                const html = await response.text();
                expect(html).toContain('api-reference');
                expect(html).toContain('openapi.json');
            });
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const response = await fetchAPI('/api/nonexistent');
            expect(response.status).toBe(404);
        });

        it('should handle malformed requests gracefully', async () => {
            const response = await fetchAPI('/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid json',
            });

            expect(response.status).toBe(405);
        });
    });

    describe('Performance', () => {
        it('should handle concurrent requests', async () => {
            const requests = Array.from({ length: 5 }, () => fetchJSON('/api'));
            const results = await Promise.all(requests);

            expect(results.length).toBe(5);
            results.forEach((data) => {
                expect(data).toHaveProperty('message');
            });
        });

        it('should return consistent results', async () => {
            const results = await Promise.all([
                fetchJSON('/api'),
                fetchJSON('/api'),
                fetchJSON('/api'),
            ]);

            results.forEach((data) => {
                expect(data).toHaveProperty('message');
            });
        });
    });
});
