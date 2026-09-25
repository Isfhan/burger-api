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
        const response = await fetch(url, { ...options, signal: controller.signal });
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

function validateWildcardResponse(data: any, expectedPath: string, expectedSegments: number) {
    expect(data).toHaveProperty('path');
    expect(data).toHaveProperty('segments');
    expect(data.path).toBe(expectedPath);
    expect(data.segments).toBe(expectedSegments);
}

const AUTH_ENDPOINTS = [
    'login', 'logout', 'register', 'forgot-password', 'reset-password', 'verify-email',
];

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

describe('Wildcard Routes API', () => {
    describe('Static Routes', () => {
        it('should handle GET /api/admin', async () => {
            const data = await fetchJSON('/api/admin');
            expect(data.message).toBe('Static admin route');
            expect(data).toHaveProperty('note');
        });

        it('should handle GET /api/users with user list', async () => {
            const data = await fetchJSON('/api/users');
            expect(data.message).toBe('Users list');
            expect(Array.isArray(data.users)).toBe(true);
            expect(data.users.length).toBe(2);
            expect(data.users[0]).toHaveProperty('id');
            expect(data.users[0]).toHaveProperty('name');
        });

        it('should return 404 for non-existent static route', async () => {
            const response = await fetchAPI('/api/nonexistent');
            expect(response.status).toBe(404);
        });
    });

    describe('Admin Wildcard Routes (with static sibling)', () => {
        const testCases = [
            { path: '/api/admin/users', expectedPath: 'users', expectedSegments: 1 },
            { path: '/api/admin/settings', expectedPath: 'settings', expectedSegments: 1 },
            { path: '/api/admin/settings/privacy', expectedPath: 'settings/privacy', expectedSegments: 2 },
            { path: '/api/admin/config/database', expectedPath: 'config/database', expectedSegments: 2 },
            { path: '/api/admin/config/database/connections', expectedPath: 'config/database/connections', expectedSegments: 3 },
        ];

        testCases.forEach(({ path, expectedPath, expectedSegments }) => {
            it(`should handle ${path}`, async () => {
                const data = await fetchJSON(path);
                expect(data.message).toBe('Admin wildcard route');
                validateWildcardResponse(data, expectedPath, expectedSegments);
            });
        });

        it('should handle admin wildcard with special characters', async () => {
            const data = await fetchJSON('/api/admin/test-123_special.characters');
            expect(data.message).toBe('Admin wildcard route');
            expect(data.segments).toBeGreaterThan(0);
        });
    });

    describe('Auth Wildcard Routes (no static sibling)', () => {
        it('should handle base path /api/auth', async () => {
            const data = await fetchJSON('/api/auth');
            expect(data.message).toBe('Auth wildcard route');
            validateWildcardResponse(data, '', 0);
        });

        AUTH_ENDPOINTS.forEach((endpoint) => {
            it(`should handle /api/auth/${endpoint}`, async () => {
                const data = await fetchJSON(`/api/auth/${endpoint}`);
                expect(data.message).toBe('Auth wildcard route');
                validateWildcardResponse(data, endpoint, 1);
            });
        });

        it('should handle nested auth paths', async () => {
            const cases = [
                { path: '/api/auth/sessions/active', expectedPath: 'sessions/active', expectedSegments: 2 },
                { path: '/api/auth/tokens/refresh', expectedPath: 'tokens/refresh', expectedSegments: 2 },
                { path: '/api/auth/users/123/profile', expectedPath: 'users/123/profile', expectedSegments: 3 },
            ];
            for (const { path, expectedPath, expectedSegments } of cases) {
                const data = await fetchJSON(path);
                expect(data.message).toBe('Auth wildcard route');
                validateWildcardResponse(data, expectedPath, expectedSegments);
            }
        });

        it('should handle auth wildcard with query parameters', async () => {
            const data = await fetchJSON('/api/auth/login?redirect=/dashboard');
            expect(data.message).toBe('Auth wildcard route');
            validateWildcardResponse(data, 'login', 1);
        });
    });

    describe('Dynamic Routes', () => {
        it('should handle GET /api/users/1', async () => {
            const data = await fetchJSON('/api/users/1');
            expect(data.message).toBe('User details');
            expect(data.userId).toBe('1');
        });

        it('should handle GET /api/users/2', async () => {
            const data = await fetchJSON('/api/users/2');
            expect(data.message).toBe('User details');
            expect(data.userId).toBe('2');
        });

        it('should handle user route with trailing slash', async () => {
            const response = await fetchAPI('/api/users/1/');
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.message).toBe('User wildcard route');
        });
    });

    describe('User Wildcard Routes (inside dynamic route)', () => {
        describe('Single Segment', () => {
            const singleSegmentTests = [
                { path: '/api/users/1/profile', userId: '1', expectedPath: 'profile', expectedSegments: 1 },
                { path: '/api/users/2/settings', userId: '2', expectedPath: 'settings', expectedSegments: 1 },
                { path: '/api/users/3/posts', userId: '3', expectedPath: 'posts', expectedSegments: 1 },
            ];

            singleSegmentTests.forEach(({ path, userId, expectedPath, expectedSegments }) => {
                it(`should handle ${path}`, async () => {
                    const data = await fetchJSON(path);
                    expect(data.message).toBe('User wildcard route');
                    expect(data.userId).toBe(userId);
                    validateWildcardResponse(data, expectedPath, expectedSegments);
                });
            });
        });

        describe('Multiple Segments', () => {
            const multiSegmentTests = [
                { path: '/api/users/1/settings/privacy', userId: '1', expectedPath: 'settings/privacy', expectedSegments: 2 },
                { path: '/api/users/1/settings/notifications/email', userId: '1', expectedPath: 'settings/notifications/email', expectedSegments: 3 },
                { path: '/api/users/2/activities/recent', userId: '2', expectedPath: 'activities/recent', expectedSegments: 2 },
            ];

            multiSegmentTests.forEach(({ path, userId, expectedPath, expectedSegments }) => {
                it(`should handle ${path}`, async () => {
                    const data = await fetchJSON(path);
                    expect(data.message).toBe('User wildcard route');
                    expect(data.userId).toBe(userId);
                    validateWildcardResponse(data, expectedPath, expectedSegments);
                });
            });
        });

        describe('Deep Nesting', () => {
            it('should handle very deep nested paths', async () => {
                const data = await fetchJSON('/api/users/2/posts/123/comments/456/replies/789');
                expect(data.message).toBe('User wildcard route');
                expect(data.userId).toBe('2');
                expect(data.segments).toBe(6);
            });

            it('should handle complex nested structure', async () => {
                const data = await fetchJSON('/api/users/1/projects/abc/tasks/xyz/subtasks/123');
                expect(data.message).toBe('User wildcard route');
                expect(data.userId).toBe('1');
                expect(data.segments).toBe(6);
            });
        });

        describe('Edge Cases', () => {
            it('should return user details for direct user path', async () => {
                const data = await fetchJSON('/api/users/1');
                expect(data.message).toBe('User details');
            });

            it('should handle numeric segments correctly', async () => {
                const data = await fetchJSON('/api/users/1/posts/123/comments/456');
                expect(data.userId).toBe('1');
                expect(data.segments).toBe(4);
                expect(data.path).toBe('posts/123/comments/456');
            });

            it('should handle special characters in segments', async () => {
                const data = await fetchJSON('/api/users/1/test-123_special.characters');
                expect(data.userId).toBe('1');
                expect(data.segments).toBeGreaterThan(0);
            });
        });
    });

    describe('Nested Dynamic Routes', () => {
        it('should handle GET /api/users/1/posts/100', async () => {
            const data = await fetchJSON('/api/users/1/posts/100');
            expect(data.message).toBe('Post details');
            expect(data.userId).toBe('1');
            expect(data.postId).toBe('100');
        });

        it('should handle GET /api/users/2/posts/200', async () => {
            const data = await fetchJSON('/api/users/2/posts/200');
            expect(data.message).toBe('Post details');
            expect(data.userId).toBe('2');
            expect(data.postId).toBe('200');
        });

        it('should handle GET /api/users/3/posts/300', async () => {
            const data = await fetchJSON('/api/users/3/posts/300');
            expect(data.message).toBe('Post details');
            expect(data.userId).toBe('3');
            expect(data.postId).toBe('300');
        });

        it('should handle GET /api/users/4/posts/400', async () => {
            const data = await fetchJSON('/api/users/4/posts/400');
            expect(data.message).toBe('Post details');
            expect(data.userId).toBe('4');
            expect(data.postId).toBe('400');
        });
    });

    describe('Route Priority', () => {
        it('should prioritize static route over wildcard', async () => {
            const data = await fetchJSON('/api/admin');
            expect(data.message).toBe('Static admin route');
            expect(data).not.toHaveProperty('segments');
        });

        it('should prioritize dynamic route over wildcard', async () => {
            const data = await fetchJSON('/api/users/1');
            expect(data.message).toBe('User details');
            expect(data).not.toHaveProperty('segments');
        });

        it('should prioritize nested dynamic route over wildcard', async () => {
            const data = await fetchJSON('/api/users/1/posts/100');
            expect(data.message).toBe('Post details');
            expect(data).toHaveProperty('postId');
            expect(data).not.toHaveProperty('segments');
        });

        it('should match wildcard when no exact route exists', async () => {
            const data = await fetchJSON('/api/users/1/profile');
            expect(data.message).toBe('User wildcard route');
            expect(data).toHaveProperty('segments');
        });
    });

    describe('HTTP Methods', () => {
        it('should handle GET requests', async () => {
            const response = await fetchAPI('/api/users', { method: 'GET' });
            expect(response.status).toBe(200);
        });

        it('should handle HEAD requests', async () => {
            const response = await fetchAPI('/api/users', { method: 'HEAD' });
            expect([200, 405]).toContain(response.status);
        });

        it('should handle OPTIONS requests', async () => {
            const response = await fetchAPI('/api/users', { method: 'OPTIONS' });
            expect([200, 204, 405]).toContain(response.status);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const response = await fetchAPI('/api/nonexistent/route');
            expect(response.status).toBe(404);
        });

        it('should handle very long paths', async () => {
            const longPath = '/api/users/1/' + 'a'.repeat(1000);
            const response = await fetchAPI(longPath);
            expect([200, 404, 414]).toContain(response.status);
        });
    });

    describe('Performance & Consistency', () => {
        it('should return consistent results for same endpoint', async () => {
            const results = await Promise.all([
                fetchJSON('/api/users/1'),
                fetchJSON('/api/users/1'),
                fetchJSON('/api/users/1'),
            ]);
            results.forEach((data) => {
                expect(data.message).toBe('User details');
                expect(data.userId).toBe('1');
            });
        });

        it('should handle concurrent requests', async () => {
            const requests = Array.from({ length: 10 }, (_, i) =>
                fetchJSON(`/api/users/${(i % 4) + 1}`)
            );
            const results = await Promise.all(requests);
            expect(results.length).toBe(10);
            results.forEach((data) => {
                expect(data.message).toBe('User details');
            });
        });
    });
});
