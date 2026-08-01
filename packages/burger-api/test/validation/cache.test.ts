import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { ValidatorCache } from '../../src/validation/cache';

describe('ValidatorCache', () => {
    it('stores and retrieves a validator by identity', () => {
        const cache = new ValidatorCache();
        const fake = {
            kind: 'zod',
            slot: 'query',
            identity: 'zod:abc',
            validate: (() => ({ success: true, data: {} })) as any,
            coercible: false,
        };
        expect(cache.get('zod:abc')).toBeUndefined();
        cache.set('zod:abc', fake as any);
        expect(cache.get('zod:abc')).toBe(fake);
        expect(cache.has('zod:abc')).toBe(true);
    });

    it('keeps distinct schemas under distinct identities', () => {
        const cache = new ValidatorCache();
        const a = { identity: 'zod:a' } as any;
        const b = { identity: 'zod:b' } as any;
        cache.set('zod:a', a);
        cache.set('zod:b', b);
        expect(cache.get('zod:a')).toBe(a);
        expect(cache.get('zod:b')).toBe(b);
        expect(cache.size).toBe(2);
    });

    it('clear() empties the cache', () => {
        const cache = new ValidatorCache();
        cache.set('zod:a', { identity: 'zod:a' } as any);
        expect(cache.size).toBe(1);
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.get('zod:a')).toBeUndefined();
    });

    it('supports identity sharing: same identity yields same cached object', () => {
        const cache = new ValidatorCache();
        const schema = z.object({ x: z.string() });
        const id = 'zod:' + schema.toString();
        const cv = { identity: id } as any;
        cache.set(id, cv);
        // A second route with the same identity reuses the cached validator.
        expect(cache.get(id)).toBe(cv);
    });
});
