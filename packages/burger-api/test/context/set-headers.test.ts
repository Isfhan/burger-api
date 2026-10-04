import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import { TrackedContextSet } from '../../src/context/context-set';
import { applySet } from '../../src/utils/response';
import type { RouteDefinition } from '../../src/types/index';

describe('ctx.set.headers is always defined', () => {
    it('assigning a key never throws and is applied', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/h',
                handlers: {
                    GET: (ctx: any) => {
                        ctx.set.headers['x-id'] = 'v';
                        return new Response('ok');
                    },
                },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/h'));
        expect(res.headers.get('x-id')).toBe('v');
    });

    it('array values are appended (two Set-Cookie survive)', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/cookies',
                handlers: {
                    GET: (ctx: any) => {
                        ctx.set.headers['set-cookie'] = ['a=1', 'b=2'];
                        return new Response('ok');
                    },
                },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/cookies'));
        const cookies = res.headers.getSetCookie();
        expect(cookies).toEqual(['a=1', 'b=2']);
    });

    it('ctx.set Set-Cookie is appended to the handler Set-Cookie', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/both',
                handlers: {
                    GET: (ctx: any) => {
                        ctx.set.headers['set-cookie'] = 'from-set=1';
                        return new Response('ok', {
                            headers: { 'set-cookie': 'from-handler=1' },
                        });
                    },
                },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/both'));
        const cookies = res.headers.getSetCookie().sort();
        expect(cookies).toEqual(['from-handler=1', 'from-set=1']);
    });

    it('other headers keep ctx.set wins', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/wins',
                handlers: {
                    GET: (ctx: any) => {
                        ctx.set.headers['x-v'] = 'set';
                        return new Response('ok', {
                            headers: { 'x-v': 'handler' },
                        });
                    },
                },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/wins'));
        expect(res.headers.get('x-v')).toBe('set');
    });

    it('two hooks assigning different keys both survive', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/hooks',
                hooks: {
                    beforeRoute: (ctx: any) => {
                        ctx.set.headers['x-first'] = '1';
                    },
                    afterRoute: (ctx: any) => {
                        ctx.set.headers['x-second'] = '2';
                    },
                },
                handlers: { GET: () => new Response('ok') },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/hooks'));
        expect(res.headers.get('x-first')).toBe('1');
        expect(res.headers.get('x-second')).toBe('2');
    });
});

describe('TrackedContextSet.headers', () => {
    it('lazily creates a record and flips the headers flag', () => {
        const set = new TrackedContextSet();
        expect(set.headers).toBeDefined();
        const record = set.headers as Record<string, string>;
        record['x'] = 'y';
        expect(applySet(new Response('ok'), set).headers.get('x')).toBe('y');
    });

    it('keeps a whole-object assignment working', () => {
        const set = new TrackedContextSet();
        set.headers = { a: 'b' };
        expect(applySet(new Response('ok'), set).headers.get('a')).toBe('b');
    });
});
