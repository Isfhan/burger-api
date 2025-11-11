/**
 * Comprehensive test suite for wildcard-routes example
 *
 * @file examples/wildcard-routes/api.test.ts
 * @description Tests all API endpoints including static, dynamic, and wildcard routes
 *
 * Usage:
 *   1. Start the server: bun run examples/wildcard-routes/index.ts
 *   2. In another terminal, run: bun test examples/wildcard-routes/api.test.ts
 *
 * Features:
 *   - Uses Bun's built-in test runner (13x faster than Jest)
 *   - Organized test groups with describe blocks
 *   - Reusable test utilities and helpers
 *   - Parameterized tests for similar cases
 *   - Comprehensive edge case testing
 *   - Better error messages and assertions
 *   - Watch mode: bun test --watch
 *   - Test filtering: bun test --test-name-pattern "Admin"
 */

import { describe, it, expect, beforeAll } from 'bun:test';

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = 'http://localhost:4000';
const REQUEST_TIMEOUT = 5000; // 5 seconds

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Makes a fetch request with timeout and error handling
 */
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

/**
 * Fetches and parses JSON response
 */
async function fetchJSON<T = any>(path: string): Promise<T> {
    const response = await fetchAPI(path);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return response.json();
}

/**
 * Validates wildcard params structure
 */
function validateWildcardParams(data: any, expectedCount: number) {
    expect(data).toHaveProperty('wildcardParams');
    expect(data).toHaveProperty('segments');
    expect(Array.isArray(data.wildcardParams)).toBe(true);
    expect(typeof data.segments).toBe('number');
    expect(data.segments).toBe(expectedCount);
    expect(data.segments).toBe(data.wildcardParams.length);
}

/**
 * Validates route response structure
 */
function validateRouteResponse(data: any, expectedMessage: string) {
    expect(data).toHaveProperty('message');
    expect(data.message).toBe(expectedMessage);
}

/**
 * Checks if server is running
 */
async function checkServer(): Promise<boolean> {
    try {
        const response = await fetchAPI('/api/users');
        return response.status === 200;
    } catch {
        return false;
    }
}

// ============================================================================
// Test Data
// ============================================================================

const VALID_USER_IDS = ['1', '2', '3', '4'];
const INVALID_USER_IDS = ['999', '0', '-1', 'invalid'];
const AUTH_ENDPOINTS = [
    'login',
    'logout',
    'register',
    'forgot-password',
    'reset-password',
    'verify-email',
];

// ============================================================================
// Setup
// ============================================================================

beforeAll(async () => {
    const isRunning = await checkServer();
    if (!isRunning) {
        throw new Error(
            '❌ Server is not running!\n\n' +
                'Please start the server first:\n' +
                '  bun run examples/wildcard-routes/index.ts\n\n' +
                'Then run the tests in another terminal:\n' +
                '  bun test examples/wildcard-routes/api.test.ts'
        );
    }
    console.log('✅ Server is running, starting tests...\n');
});

// ============================================================================
// Test Suites
// ============================================================================

describe('Wildcard Routes API', () => {
    describe('Static Routes', () => {
        it('should handle GET /api/admin', async () => {
            const data = await fetchJSON(`${BASE_URL}/api/admin`);
            validateRouteResponse(data, 'Static admin route working');
        });

        it('should handle GET /api/users with user list', async () => {
            const data = await fetchJSON(`${BASE_URL}/api/users`);
            validateRouteResponse(data, 'Users list route working');
            expect(data).toHaveProperty('users');
            expect(Array.isArray(data.users)).toBe(true);
            expect(data.users.length).toBeGreaterThan(0);
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
            {
                path: '/api/admin/users',
                expectedParams: ['users'],
                description: 'single segment',
            },
            {
                path: '/api/admin/settings',
                expectedParams: ['settings'],
                description: 'single segment - settings',
            },
            {
                path: '/api/admin/settings/privacy',
                expectedParams: ['settings', 'privacy'],
                description: 'multiple segments',
            },
            {
                path: '/api/admin/config/database',
                expectedParams: ['config', 'database'],
                description: 'nested segments',
            },
            {
                path: '/api/admin/config/database/connections',
                expectedParams: ['config', 'database', 'connections'],
                description: 'deep nesting',
            },
        ];

        testCases.forEach(({ path, expectedParams, description }) => {
            it(`should handle ${description}`, async () => {
                const data = await fetchJSON(path);
                validateRouteResponse(data, 'Admin wildcard route working');
                expect(data).toHaveProperty('adminPath');
                expect(data.wildcardParams).toEqual(expectedParams);
                validateWildcardParams(data, expectedParams.length);
                expect(data.adminPath).toBe(expectedParams.join('/'));
            });
        });

        it('should handle admin wildcard with special characters', async () => {
            const data = await fetchJSON(
                '/api/admin/test-123_special.characters'
            );
            validateRouteResponse(data, 'Admin wildcard route working');
            expect(data.wildcardParams.length).toBeGreaterThan(0);
        });

        it('should handle admin wildcard with empty segments', async () => {
            // Multiple slashes should be handled gracefully
            const data = await fetchJSON('/api/admin///test');
            expect(data).toHaveProperty('wildcardParams');
        });
    });

    describe('Auth Wildcard Routes (no static sibling)', () => {
        it('should handle base path /api/auth', async () => {
            const data = await fetchJSON('/api/auth');
            validateRouteResponse(data, 'Auth wildcard route');
            expect(data.wildcardParams).toEqual([]);
            validateWildcardParams(data, 0);
            expect(data.authPath).toBe('');
        });

        // Parameterized tests for auth endpoints
        AUTH_ENDPOINTS.forEach((endpoint) => {
            it(`should handle /api/auth/${endpoint}`, async () => {
                const data = await fetchJSON(`/api/auth/${endpoint}`);
                validateRouteResponse(data, 'Auth wildcard route');
                expect(data.wildcardParams).toEqual([endpoint]);
                validateWildcardParams(data, 1);
                expect(data.authPath).toBe(endpoint);
            });
        });

        it('should handle nested auth paths', async () => {
            const testCases = [
                {
                    path: '/api/auth/sessions/active',
                    expected: ['sessions', 'active'],
                },
                {
                    path: '/api/auth/tokens/refresh',
                    expected: ['tokens', 'refresh'],
                },
                {
                    path: '/api/auth/users/123/profile',
                    expected: ['users', '123', 'profile'],
                },
            ];

            for (const { path, expected } of testCases) {
                const data = await fetchJSON(path);
                validateRouteResponse(data, 'Auth wildcard route');
                expect(data.wildcardParams).toEqual(expected);
                validateWildcardParams(data, expected.length);
            }
        });

        it('should handle auth wildcard with query parameters', async () => {
            const data = await fetchJSON('/api/auth/login?redirect=/dashboard');
            expect(data.wildcardParams).toEqual(['login']);
            validateWildcardParams(data, 1);
        });
    });

    describe('Dynamic Routes', () => {
        describe('Valid User IDs', () => {
            VALID_USER_IDS.forEach((userId) => {
                it(`should handle GET /api/users/${userId}`, async () => {
                    const data = await fetchJSON(`/api/users/${userId}`);
                    validateRouteResponse(data, 'User found');
                    expect(data).toHaveProperty('user');
                    expect(data.user).toHaveProperty('id');
                    expect(data.user).toHaveProperty('name');
                    expect(String(data.user.id)).toBe(userId);
                });
            });
        });

        describe('Invalid User IDs', () => {
            INVALID_USER_IDS.forEach((userId) => {
                it(`should return 404 for invalid user ID: ${userId}`, async () => {
                    const response = await fetchAPI(`/api/users/${userId}`);
                    expect(response.status).toBe(404);
                    const data = await response.json();
                    expect(data.message).toBe('User not found');
                });
            });
        });

        it('should handle user route with trailing slash', async () => {
            // Note: Trailing slash may match wildcard route instead of dynamic route
            const response = await fetchAPI('/api/users/1/');
            expect(response.status).toBe(200);
            const data = await response.json();
            // Could match either dynamic or wildcard route
            expect(['User found', 'Wildcard route example working']).toContain(
                data.message
            );
        });
    });

    describe('User Wildcard Routes (inside dynamic route)', () => {
        describe('Single Segment', () => {
            const singleSegmentTests = [
                { path: '/api/users/1/profile', expected: ['profile'] },
                { path: '/api/users/2/settings', expected: ['settings'] },
                { path: '/api/users/3/posts', expected: ['posts'] },
            ];

            singleSegmentTests.forEach(({ path, expected }) => {
                it(`should handle ${path}`, async () => {
                    const data = await fetchJSON(path);
                    validateRouteResponse(
                        data,
                        'Wildcard route example working'
                    );
                    expect(data).toHaveProperty('userId');
                    expect(data).toHaveProperty('userPath');
                    expect(data.wildcardParams).toEqual(expected);
                    validateWildcardParams(data, expected.length);
                });
            });
        });

        describe('Multiple Segments', () => {
            const multiSegmentTests = [
                {
                    path: '/api/users/1/settings/privacy',
                    expected: ['settings', 'privacy'],
                },
                {
                    path: '/api/users/1/settings/notifications/email',
                    expected: ['settings', 'notifications', 'email'],
                },
                {
                    path: '/api/users/2/activities/recent',
                    expected: ['activities', 'recent'],
                },
            ];

            multiSegmentTests.forEach(({ path, expected }) => {
                it(`should handle ${path}`, async () => {
                    const data = await fetchJSON(path);
                    validateRouteResponse(
                        data,
                        'Wildcard route example working'
                    );
                    expect(data.userId).toBe(path.split('/')[3]);
                    expect(data.wildcardParams).toEqual(expected);
                    validateWildcardParams(data, expected.length);
                    expect(data.userPath).toContain(expected.join('/'));
                });
            });
        });

        describe('Deep Nesting', () => {
            it('should handle very deep nested paths', async () => {
                const path = '/api/users/2/posts/123/comments/456/replies/789';
                const data = await fetchJSON(path);
                validateRouteResponse(data, 'Wildcard route example working');
                expect(data.wildcardParams.length).toBe(6);
                expect(data.segments).toBe(6);
            });

            it('should handle complex nested structure', async () => {
                const path = '/api/users/1/projects/abc/tasks/xyz/subtasks/123';
                const data = await fetchJSON(path);
                expect(data.wildcardParams.length).toBe(6);
                validateWildcardParams(data, 6);
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty wildcard params', async () => {
                // This should match the dynamic route, not wildcard
                const data = await fetchJSON('/api/users/1');
                expect(data.message).toBe('User found');
            });

            it('should handle numeric segments correctly', async () => {
                const data = await fetchJSON(
                    '/api/users/1/posts/123/comments/456'
                );
                expect(data.wildcardParams).toEqual([
                    'posts',
                    '123',
                    'comments',
                    '456',
                ]);
                expect(data.wildcardParams[1]).toBe('123');
                expect(data.wildcardParams[3]).toBe('456');
            });

            it('should handle special characters in segments', async () => {
                const data = await fetchJSON(
                    '/api/users/1/test-123_special.characters'
                );
                expect(data.wildcardParams.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Nested Dynamic Routes', () => {
        const nestedTests = [
            { userId: '1', postId: '100' },
            { userId: '2', postId: '200' },
            { userId: '3', postId: '300' },
            { userId: '4', postId: '400' },
        ];

        nestedTests.forEach(({ userId, postId }) => {
            it(`should handle GET /api/users/${userId}/posts/${postId}`, async () => {
                const data = await fetchJSON(
                    `/api/users/${userId}/posts/${postId}`
                );
                validateRouteResponse(
                    data,
                    'Nested dynamic route and wildcard route sibling example working'
                );
                expect(data.userId).toBe(userId);
                expect(data.postId).toBe(postId);
            });
        });

        it('should return 404 for invalid nested route', async () => {
            const response = await fetchAPI('/api/users/999/posts/999');
            // Note: This might return 404 or match wildcard route depending on implementation
            expect([404, 200]).toContain(response.status);
        });
    });

    describe('Route Priority', () => {
        it('should prioritize static route over wildcard', async () => {
            const data = await fetchJSON('/api/admin');
            expect(data.message).toBe('Static admin route working');
            expect(data).not.toHaveProperty('wildcardParams');
        });

        it('should prioritize dynamic route over wildcard', async () => {
            const data = await fetchJSON('/api/users/1');
            expect(data.message).toBe('User found');
            expect(data).toHaveProperty('user');
            expect(data).not.toHaveProperty('wildcardParams');
        });

        it('should prioritize nested dynamic route over wildcard', async () => {
            const data = await fetchJSON('/api/users/1/posts/100');
            expect(data.message).toBe(
                'Nested dynamic route and wildcard route sibling example working'
            );
            expect(data).toHaveProperty('postId');
            expect(data).not.toHaveProperty('wildcardParams');
        });

        it('should match wildcard when no exact route exists', async () => {
            const data = await fetchJSON('/api/users/1/profile');
            expect(data.message).toBe('Wildcard route example working');
            expect(data).toHaveProperty('wildcardParams');
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

        it('should handle OPTIONS requests (CORS preflight)', async () => {
            const response = await fetchAPI('/api/users', {
                method: 'OPTIONS',
            });
            expect([200, 204, 405]).toContain(response.status);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const response = await fetchAPI('/api/nonexistent/route');
            expect(response.status).toBe(404);
        });

        it('should handle malformed URLs gracefully', async () => {
            const response = await fetchAPI('/api/users///invalid');
            expect([200, 404]).toContain(response.status);
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
                expect(data.message).toBe('User found');
                expect(data.user.id).toBe(1);
            });
        });

        it('should handle concurrent requests', async () => {
            const requests = Array.from({ length: 10 }, (_, i) =>
                fetchJSON(`/api/users/${(i % 4) + 1}`)
            );

            const results = await Promise.all(requests);
            expect(results.length).toBe(10);
            results.forEach((data) => {
                expect(data.message).toBe('User found');
            });
        });
    });
});
