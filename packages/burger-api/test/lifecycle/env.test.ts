/**
 * `isNotProductionEnv()` must tolerate `process.env` access throwing, e.g.
 * Deno without `--allow-env`, and fall back to the permissive default
 * instead of crashing.
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
