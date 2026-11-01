/**
 * App-level `plugins.ts` / `providers.ts`: a present file without a default
 * function export fails loud, and pages-only apps load them too.
 */
import { describe, it, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Burger } from '../../src/index';

function withAppDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const prev = process.env.BURGER_API_APP_DIR;
    process.env.BURGER_API_APP_DIR = dir;
    return fn().finally(() => {
        if (prev === undefined) delete process.env.BURGER_API_APP_DIR;
        else process.env.BURGER_API_APP_DIR = prev;
    });
}

/** onRequest mapper that tags every page response — proves the plugin ran. */
const tagPlugin = [
    'export default function (app) {',
    "    app.usePlugin({ name: 'spy', hooks: {",
    "        onRequest: () => (res) => { res.headers.set('x-plugin', 'ran'); return res; },",
    '    } });',
    '}',
].join('\n');

describe('app convention modules — loud export validation (AOT)', () => {
    it('rejects a pluginsModule without a default function export', async () => {
        const burger = new Burger({
            apiRoutes: [
                { path: '/api/x', handlers: { GET: () => new Response('x') } },
            ],
            pluginsModule: { notDefault: 1 },
        });
        await expect(burger.fetchHandler()).rejects.toThrow(
            /plugins\.ts.*default-export a function/
        );
    });

    it('rejects a providersModule without a default function export', async () => {
        const burger = new Burger({
            apiRoutes: [
                { path: '/api/x', handlers: { GET: () => new Response('x') } },
            ],
            providersModule: { default: 'nope' },
        });
        await expect(burger.fetchHandler()).rejects.toThrow(
            /providers\.ts.*default-export a function/
        );
    });
});

describe('app convention modules — pages-only AOT apps', () => {
    it('runs pluginsModule and providersModule without any apiRoutes', async () => {
        const burger = new Burger({
            pageRoutes: [
                { path: '/about', handler: () => Response.json({ ok: true }) },
            ],
            pluginsModule: {
                default: (app: Burger) => {
                    app.usePlugin({
                        name: 'spy',
                        hooks: {
                            onRequest: (ctx) => (res: Response) => {
                                res.headers.set('x-plugin', 'ran');
                                res.headers.set(
                                    'x-svc',
                                    String(
                                        (
                                            ctx.services as unknown as {
                                                greeting?: string;
                                            }
                                        ).greeting ?? ''
                                    )
                                );
                                return res;
                            },
                        },
                    });
                },
            },
            providersModule: {
                default: (app: Burger) => {
                    app.provide('greeting', 'hello');
                },
            },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/about'));
        expect(res.headers.get('x-plugin')).toBe('ran');
        // The provider was registered before the router compiled, so page
        // onRequest hooks see it too.
        expect(res.headers.get('x-svc')).toBe('hello');
    });
});

describe('app convention modules — pages-only dev apps', () => {
    it('loads plugins.ts and providers.ts without an apiDir', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-app-conv-'));
        try {
            writeFileSync(path.join(root, 'plugins.ts'), tagPlugin);
            writeFileSync(
                path.join(root, 'providers.ts'),
                [
                    'export default function (app) {',
                    "    app.provide('greeting', 'hi');",
                    '}',
                ].join('\n')
            );
            await withAppDir(root, async () => {
                const burger = new Burger({
                    pageRoutes: [
                        {
                            path: '/about',
                            handler: () => Response.json({ ok: true }),
                        },
                    ],
                });
                const handler = await burger.fetchHandler();
                const res = await handler(
                    new Request('http://localhost/about')
                );
                expect(res.headers.get('x-plugin')).toBe('ran');
            });
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects a plugins.ts without a default function export', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-app-conv-bad-'));
        try {
            writeFileSync(
                path.join(root, 'plugins.ts'),
                'export const nope = 1;\n'
            );
            await withAppDir(root, async () => {
                const burger = new Burger({
                    pageRoutes: [
                        { path: '/p', handler: () => new Response('p') },
                    ],
                });
                await expect(burger.fetchHandler()).rejects.toThrow(
                    /plugins\.ts.*default-export a function/
                );
            });
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
