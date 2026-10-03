import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition, RouteHooks } from '../../src/types/index';

function routeWithTransform(transform: Record<string, unknown>): RouteDefinition[] {
    return [
        {
            path: '/t',
            hooks: { transform } as RouteHooks,
            handlers: { GET: () => new Response('ok') },
        } as never,
    ];
}

describe('transform keys are validated at startup', () => {
    for (const key of ['cache', 'json', 'bind', 'hasSet', 'params', 'set']) {
        it(`throws for reserved key "${key}"`, () => {
            const router = new Router();
            expect(() => router.compile(routeWithTransform({ [key]: () => 1 }))).toThrow(
                new RegExp(key)
            );
        });
    }

    it('throws for a reserved key in global hooks', () => {
        const router = new Router();
        expect(() =>
            router.compile([], undefined, undefined, undefined, {
                transform: { query: () => ({}) },
            } as RouteHooks)
        ).toThrow(/query/);
    });

    it('throws for a reserved key in plugin transforms', () => {
        const router = new Router();
        expect(() =>
            router.compile([], [
                {
                    name: 'p',
                    scope: 'plugin',
                    hooks: { transform: { headers: () => 1 } },
                } as never,
            ])
        ).toThrow(/headers/);
    });

    it('accepts a normal custom key', () => {
        const router = new Router();
        expect(() =>
            router.compile(routeWithTransform({ tenant: () => 'acme' }))
        ).not.toThrow();
    });
});
