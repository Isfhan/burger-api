/**
 * `isDevelopmentEnv()` / `resolveDebug()`: debug output is opt-in and must
 * tolerate `process.env` access throwing (e.g. Deno without `--allow-env`).
 */
import { describe, it, expect } from 'bun:test';
import { isDevelopmentEnv, resolveDebug } from '../../src/utils/env';

describe('isDevelopmentEnv', () => {
    it('is true only for NODE_ENV=development', () => {
        const original = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';
            expect(isDevelopmentEnv()).toBe(false);
            process.env.NODE_ENV = 'development';
            expect(isDevelopmentEnv()).toBe(true);
            delete process.env.NODE_ENV;
            expect(isDevelopmentEnv()).toBe(false);
        } finally {
            if (original === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = original;
        }
    });

    it('falls back to false when process.env throws (Deno without --allow-env)', () => {
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
            expect(isDevelopmentEnv()).toBe(false);
        } finally {
            if (originalDescriptor) {
                Object.defineProperty(process, 'env', originalDescriptor);
            }
        }
    });
});

describe('resolveDebug', () => {
    it('honors an explicit flag over the environment', () => {
        const original = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'development';
            expect(resolveDebug(true)).toBe(true);
            expect(resolveDebug(false)).toBe(false);
            delete process.env.NODE_ENV;
            expect(resolveDebug(true)).toBe(true);
            expect(resolveDebug(undefined)).toBe(false);
        } finally {
            if (original === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = original;
        }
    });
});
