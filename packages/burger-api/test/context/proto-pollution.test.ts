/**
 * Prototype pollution: attacker-controlled keys (query, cookie, header,
 * transform) must never corrupt records or the context prototype.
 */
import { describe, it, expect } from 'bun:test';
import { parseQuery } from '../../src/context/query-parser';
import { parseCookies } from '../../src/validation/validator';
import { applyTransform } from '../../src/lifecycle/transform';
import { apply as applyCoercion } from '../../src/validation/coerce';

describe('prototype pollution hardening', () => {
    it('query: __proto__ key lands as an own property on a null-prototype record', () => {
        const q = parseQuery('x=1&__proto__=a');
        expect(Object.getPrototypeOf(q)).toBeNull();
        expect(q['__proto__']).toBe('a');
        expect(q.x).toBe('1');
        // The global Object prototype must be untouched.
        expect(Object.getPrototypeOf({})).toBe(Object.prototype);
        expect(Object.keys({})).not.toContain('__proto__');
    });

    it('query: repeated __proto__ keys accumulate without corrupting the record', () => {
        const q = parseQuery('__proto__=a&__proto__=b&x=1');
        expect(Object.getPrototypeOf(q)).toBeNull();
        expect(q['__proto__']).toEqual(['a', 'b']);
        expect(q.x).toBe('1');
    });

    it('cookies: __proto__ keys are harmless', () => {
        const c = parseCookies('__proto__=a; session=xyz');
        expect(Object.getPrototypeOf(c)).toBeNull();
        expect(c['__proto__']).toBe('a');
        expect(c.session).toBe('xyz');
    });

    it('coercion: __proto__ fields in the plan output stay own properties', () => {
        // A real own '__proto__' key (computed, not a literal — object
        // literals treat `__proto__` as a prototype setter).
        const input: Record<string, string> = Object.create(null);
        input['__proto__'] = 'x';
        input.n = '5';
        const out = applyCoercion({ slot: 'query', fields: { n: 'number' } }, input);
        expect(Object.getPrototypeOf(out)).toBeNull();
        expect(out['__proto__']).toBe('x');
        expect(out.n).toBe(5);
    });

    it('transform: __proto__ and constructor keys are rejected', async () => {
        const ctx = {
            method: 'get',
            url: 'http://h/',
            headers: new Headers(),
            params: {},
        } as unknown as Record<string, unknown>;
        await applyTransform(
            ctx as never,
            {
                '__proto__': () => ({ polluted: true }),
                constructor: () => 'nope',
                fine: () => 'ok',
            } as never
        );
        expect(Object.getPrototypeOf(ctx)).toBe(Object.prototype);
        expect(ctx.fine).toBe('ok');
        // Neither key may land as an own property, and the context's
        // prototype/constructor must be untouched.
        expect(Object.prototype.hasOwnProperty.call(ctx, '__proto__')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(ctx, 'constructor')).toBe(false);
        expect(ctx.constructor).toBe(Object);
    });
});