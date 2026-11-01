/**
 * Scaffolded version pins: the build-time CLI_VERSION define wins over the
 * packaged version, and the zod pin degrades from installed version to
 * burger-api's own range to a warned fallback.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generatePackageJson } from '../src/utils/templates';
import { setLocalMode } from '../src/utils/local-mode';

const pkgVersion = (
    JSON.parse(
        readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf-8')
    ) as { version: string }
).version;

function scaffold(): {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
} {
    return JSON.parse(generatePackageJson('x'));
}

describe('cliVersion resolution', () => {
    beforeEach(() => {
        setLocalMode(undefined);
        delete process.env.BURGER_API_LOCAL;
        delete (globalThis as { CLI_VERSION?: string }).CLI_VERSION;
    });

    afterEach(() => {
        delete (globalThis as { CLI_VERSION?: string }).CLI_VERSION;
    });

    it('prefers the build-time CLI_VERSION define', () => {
        (globalThis as { CLI_VERSION?: string }).CLI_VERSION = '9.9.9';
        expect(scaffold().devDependencies['@burger-api/cli']).toBe('^9.9.9');
    });

    it('falls back to the packaged version when the define is absent', () => {
        expect(scaffold().devDependencies['@burger-api/cli']).toBe(
            `^${pkgVersion}`
        );
    });
});

describe('resolveMatchingZodVersion', () => {
    beforeEach(() => {
        setLocalMode(undefined);
        delete process.env.BURGER_API_LOCAL;
    });

    it("pins the zod version burger-api resolves", () => {
        expect(scaffold().dependencies.zod).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("falls back to burger-api's own range without warning when zod is not resolvable", () => {
        const logs: string[] = [];
        const logSpy = spyOn(console, 'log').mockImplementation(
            (...args: unknown[]) => logs.push(args.map(String).join(' '))
        );
        const original = Bun.resolveSync;
        const resolveSpy = spyOn(Bun, 'resolveSync').mockImplementation(((
            specifier: string,
            parent: string
        ) => {
            if (specifier === 'zod') throw new Error('zod not installed');
            return original(specifier, parent);
        }) as typeof Bun.resolveSync);
        try {
            const pkg = scaffold();
            // The range from burger-api's package.json, not silence.
            expect(pkg.dependencies.zod).toMatch(/^[\^~]/);
            expect(
                logs.some((l) => l.includes("Could not resolve burger-api's"))
            ).toBe(false);
        } finally {
            resolveSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('uses the fallback and warns when nothing resolves', () => {
        const logs: string[] = [];
        const logSpy = spyOn(console, 'log').mockImplementation(
            (...args: unknown[]) => logs.push(args.map(String).join(' '))
        );
        const resolveSpy = spyOn(Bun, 'resolveSync').mockImplementation((() => {
            throw new Error('nothing resolvable');
        }) as typeof Bun.resolveSync);
        try {
            const pkg = scaffold();
            expect(pkg.dependencies.zod).toBe('^4.5.4');
            expect(
                logs.some((l) =>
                    l.includes("Could not resolve burger-api's zod version")
                )
            ).toBe(true);
        } finally {
            resolveSpy.mockRestore();
            logSpy.mockRestore();
        }
    });
});
