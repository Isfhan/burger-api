/**
 * Regression test: reading `process.env.NODE_ENV` used to be a bare,
 * unguarded property access in three places (`lifecycle/jit.ts`,
 * `lifecycle/executor.ts` x2) — found while actually running an example
 * app under `deno serve` (no framework test previously exercised this).
 * Deno's permission model throws a `NotCapable` error on the *first*
 * `process.env` access unless `--allow-env` is granted — not just
 * `undefined` the way Node/Bun behave without the var set — so every real
 * request crashed with a 500 the moment a route needed its hook plan
 * compiled. Fixed by centralizing the read in `isNotProductionEnv()`,
 * which treats a throw the same as `process` not existing at all
 * (Cloudflare Workers without `nodejs_compat`): fall back to the
 * permissive default instead of crashing.
 */
import { describe, it, expect } from 'bun:test';
import { isNotProductionEnv } from '../../src/utils/env';

describe('isNotProductionEnv', () => {
    it('reflects NODE_ENV when process.env is readable', () => {
        const original = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';
            expect(isNotProductionEnv()).toBe(false);
            process.env.NODE_ENV = 'development';
            expect(isNotProductionEnv()).toBe(true);
        } finally {
            if (original === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = original;
        }
    });

    it('falls back to true when process.env throws (Deno without --allow-env)', () => {
        const originalDescriptor = Object.getOwnPropertyDescriptor(
            process,
            'env'
        );
        Object.defineProperty(process, 'env', {
            configurable: true,
            get(): never {
                throw new Error(
                    'NotCapable: Requires env access to "NODE_ENV"'
                );
            },
        });
        try {
            expect(isNotProductionEnv()).toBe(true);
        } finally {
            if (originalDescriptor) {
                Object.defineProperty(process, 'env', originalDescriptor);
            }
        }
    });
});
