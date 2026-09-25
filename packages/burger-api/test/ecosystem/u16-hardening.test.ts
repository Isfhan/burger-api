/**
 * U16 — ecosystem hardening probes:
 *
 * - basic-auth: case-insensitive "Basic" scheme (RFC 7617)
 * - security-headers: honor explicit `maxAge: 0` in HSTS
 * - cors: `Vary: Origin` on 403; allowlist intersection (no echo) on preflight
 * - env: validation at startup (not first request); `default` honored for required vars
 * - timeout: guard probes (in-budget passes through; overshoot → 408)
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import { basicAuth } from '../../../../ecosystem/plugins/basic-auth/basic-auth';
import { env } from '../../../../ecosystem/plugins/env/env';
import { securityHeaders } from '../../../../ecosystem/hooks/security-headers/security-headers';
import { cors } from '../../../../ecosystem/hooks/cors/cors';
import { requestTimeout } from '../../../../ecosystem/hooks/timeout/timeout';
import type { Plugin } from '../../src/plugin/types';
import type { RouteHooks, ForwardHook } from '../../src/lifecycle/types';
import type { HTTPMethod } from '../../src/utils/routing';
import type { RequestHandler } from '../../src/types/index';

// Ecosystem hook factories type their return as `Hook` (which may return a
// response transform). Route `beforeRoute` only promises `ForwardHook` —
// cast through `unknown` at the registration boundary, exactly as the
// convention-file loader does at runtime.
function asForwardHook(hook: unknown): ForwardHook {
    return hook as ForwardHook;
}

async function run(plugin: Plugin, init?: RequestInit): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api',
                handlers: { GET: () => Response.json({ ok: true }) },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(plugin);
    const handler = await burger.fetchHandler();
    return handler(new Request('http://localhost/api', init));
}

async function runWithHooks(
    hooks: RouteHooks,
    init?: RequestInit,
    handlers: Partial<Record<HTTPMethod, RequestHandler>> = {
        GET: async () => Response.json({ ok: true }),
    }
): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api',
                handlers,
                hooks,
                openapi: {},
            },
        ],
    });
    const handler = await burger.fetchHandler();
    return handler(new Request('http://localhost/api', init));
}

describe('U16 — basic-auth scheme', () => {
    const plugin = () =>
        basicAuth({
            validate: async (username, password) =>
                username === 'user' && password === 'pass'
                    ? { id: '1', username }
                    : null,
        });

    it('accepts lowercase "basic" scheme', async () => {
        const res = await run(plugin(), {
            headers: { Authorization: `basic ${btoa('user:pass')}` },
        });
        expect(res.status).toBe(200);
    });

    it('accepts mixed-case "Basic" scheme', async () => {
        const res = await run(plugin(), {
            headers: { Authorization: `BaSiC ${btoa('user:pass')}` },
        });
        expect(res.status).toBe(200);
    });

    it('rejects non-Basic schemes', async () => {
        const res = await run(plugin(), {
            headers: { Authorization: `bearer ${btoa('user:pass')}` },
        });
        expect(res.status).toBe(401);
    });

    it('rejects wrong credentials', async () => {
        const res = await run(plugin(), {
            headers: { Authorization: `Basic ${btoa('user:nope')}` },
        });
        expect(res.status).toBe(401);
    });
});

describe('U16 — security-headers HSTS maxAge', () => {
    it('honors explicit maxAge: 0', async () => {
        const res = await runWithHooks(
            {
                beforeRoute: [
                    asForwardHook(
                        securityHeaders({
                            strictTransportSecurity: {
                                maxAge: 0,
                                includeSubDomains: false,
                            },
                        })
                    ),
                ],
            },
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=0');
    });
});

describe('U16 — cors', () => {
    it('emits Vary: Origin on 403 for disallowed origin', async () => {
        const res = await runWithHooks(
            {
                beforeRoute: [asForwardHook(cors({ origin: ['https://allowed.com'] }))],
            },
            { headers: { Origin: 'https://evil.com' } }
        );
        expect(res.status).toBe(403);
        expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('preflight returns allowlist intersection, not an echo of arbitrary headers', async () => {
        const res = await runWithHooks(
            {
                beforeRoute: [
                    asForwardHook(
                        cors({
                            origin: ['https://allowed.com'],
                            allowedHeaders: ['content-type'],
                        })
                    ),
                ],
            },
            {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://allowed.com',
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Headers': 'x-custom-evil',
                },
            },
            {
                GET: async () => Response.json({ ok: true }),
                OPTIONS: async () => new Response(null, { status: 204 }),
            }
        );
        expect(res.status).toBe(204);
        const allowHeaders = res.headers.get('Access-Control-Allow-Headers') ?? '';
        expect(allowHeaders).not.toContain('x-custom-evil');
    });
});

describe('U16 — env plugin', () => {
    it('validates at startup (factory throws, not first request)', () => {
        const saved = process.env.U16_REQUIRED_VAR;
        delete process.env.U16_REQUIRED_VAR;
        try {
            expect(() =>
                env({ required: { U16_REQUIRED_VAR: { type: 'string' } } })
            ).toThrow(/U16_REQUIRED_VAR/);
        } finally {
            if (saved === undefined) {
                delete process.env.U16_REQUIRED_VAR;
            } else {
                process.env.U16_REQUIRED_VAR = saved;
            }
        }
    });

    it('applies default for missing required var instead of failing', () => {
        const saved = process.env.U16_PORT;
        delete process.env.U16_PORT;
        try {
            expect(() =>
                env({
                    required: { U16_PORT: { type: 'number', default: 8080 } },
                })
            ).not.toThrow();
            expect(String(process.env.U16_PORT)).toBe('8080');
        } finally {
            if (saved === undefined) {
                delete process.env.U16_PORT;
            } else {
                process.env.U16_PORT = saved;
            }
        }
    });
});

describe('U16 — timeout hook', () => {
    it('passes through fast handlers unchanged', async () => {
        const res = await runWithHooks(
            {
                beforeRoute: [asForwardHook(requestTimeout({ ms: 500 }))],
            },
            undefined,
            {
                GET: async () => {
                    await Bun.sleep(5);
                    return Response.json({ ok: true });
                },
            }
        );
        expect(res.status).toBe(200);
    });

    it('returns 408 when the handler exceeds the budget', async () => {
        const res = await runWithHooks(
            {
                beforeRoute: [asForwardHook(requestTimeout({ ms: 30 }))],
            },
            undefined,
            {
                GET: async () => {
                    await Bun.sleep(120);
                    return Response.json({ ok: true });
                },
            }
        );
        expect(res.status).toBe(408);
    });
});