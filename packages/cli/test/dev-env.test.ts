/**
 * `burger-api dev` child environment: NODE_ENV defaults to development so the
 * framework keeps rendering debug details during development.
 */
import { describe, it, expect } from 'bun:test';
import { devChildEnv } from '../src/commands/dev';

describe('devChildEnv', () => {
    it('defaults NODE_ENV to development when the caller did not set it', () => {
        const env = devChildEnv('4000', '/app/src', {});
        expect(env.NODE_ENV).toBe('development');
        expect(env.PORT).toBe('4000');
        expect(env.BURGER_API_APP_DIR).toBe('/app/src');
    });

    it('preserves an explicit NODE_ENV', () => {
        const env = devChildEnv('4000', '/app/src', {
            NODE_ENV: 'production',
        });
        expect(env.NODE_ENV).toBe('production');
    });

    it('keeps the rest of the parent environment', () => {
        const env = devChildEnv('4000', '/app/src', { KEEP: 'me' });
        expect(env.KEEP).toBe('me');
    });
});
