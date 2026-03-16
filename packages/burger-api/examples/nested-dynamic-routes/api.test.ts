/**
 * Test suite for nested-dynamic-routes example
 *
 * @file examples/nested-dynamic-routes/api.test.ts
 * @description Tests nested dynamic routes with parameter validation
 *
 * Usage:
 *   1. Start the server: bun run examples/nested-dynamic-routes/index.ts
 *   2. In another terminal, run: bun test examples/nested-dynamic-routes/api.test.ts
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
        healthPath: '/api/users',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('Nested Dynamic Routes Example', () => {
    describe('Users API', () => {
        describe('GET /api/users', () => {
            it('should return users list', async () => {
                const data = await fetchJSON('/api/users');
                expect(data).toHaveProperty('message');
                expect(data.message).toBe('Users list');
            });
        });

        describe('GET /api/users/:userId', () => {
            it('should return user with valid ID', async () => {
                const data = await fetchJSON('/api/users/1');
                expect(data).toHaveProperty('message');
                expect(data).toHaveProperty('userId');
                expect(data).toHaveProperty('level');
                expect(data.message).toBe('User details');
                expect(data.userId).toBe('1');
                expect(data.level).toBe('user');
            });

            it('should handle different user IDs', async () => {
                const testIds = ['1', '2', '123', 'abc', 'test-user'];
                for (const id of testIds) {
                    const data = await fetchJSON(`/api/users/${id}`);
                    expect(data).toHaveProperty('userId');
                    expect(data.userId).toBe(id);
                }
            });

            it('should return validation error for empty user ID', async () => {
                const response = await fetchAPI('/api/users/');
                expect([400, 404]).toContain(response.status);
            });
        });

        describe('GET /api/users/:userId/posts/:postId', () => {
            it('should return post with valid user and post IDs', async () => {
                const data = await fetchJSON('/api/users/1/posts/100');
                expect(data).toHaveProperty('message');
                expect(data).toHaveProperty('userId');
                expect(data).toHaveProperty('postId');
                expect(data).toHaveProperty('level');
                expect(data.message).toBe('Post details');
                expect(data.userId).toBe('1');
                expect(data.postId).toBe('100');
                expect(data.level).toBe('post');
            });

            it('should handle different user and post ID combinations', async () => {
                const testCases = [
                    { userId: '1', postId: '100' },
                    { userId: '2', postId: '200' },
                    { userId: '123', postId: '456' },
                    { userId: 'abc', postId: 'xyz' },
                ];

                for (const { userId, postId } of testCases) {
                    const data = await fetchJSON(
                        `/api/users/${userId}/posts/${postId}`
                    );
                    expect(data).toHaveProperty('userId');
                    expect(data).toHaveProperty('postId');
                    expect(data.userId).toBe(userId);
                    expect(data.postId).toBe(postId);
                }
            });

            it('should return validation error for empty user ID', async () => {
                const response = await fetchAPI('/api/users//posts/100');
                expect([400, 404]).toContain(response.status);
            });

            it('should return validation error for empty post ID', async () => {
                const response = await fetchAPI('/api/users/1/posts/');
                expect([400, 404]).toContain(response.status);
            });

            it('should handle special characters in IDs', async () => {
                const data = await fetchJSON(
                    '/api/users/test-123/posts/post-456'
                );
                expect(data).toHaveProperty('userId');
                expect(data).toHaveProperty('postId');
                expect(data.userId).toBe('test-123');
                expect(data.postId).toBe('post-456');
            });
        });
    });

    describe('Route Priority', () => {
        it('should prioritize static route over dynamic route', async () => {
            // /api/users should match static route, not dynamic
            const data = await fetchJSON('/api/users');
            expect(data.message).toBe('Users list');
        });

        it('should prioritize nested dynamic route over parent dynamic route', async () => {
            // /api/users/:userId/posts/:postId should match nested route, not parent
            const data = await fetchJSON('/api/users/1/posts/100');
            expect(data.level).toBe('post');
            expect(data).toHaveProperty('postId');
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const response = await fetchAPI(
                '/api/users/1/posts/100/comments/200'
            );
            expect(response.status).toBe(404);
        });

        it('should return 404 for invalid nested routes', async () => {
            const response = await fetchAPI('/api/users/1/invalid/route');
            expect(response.status).toBe(404);
        });
    });
});
