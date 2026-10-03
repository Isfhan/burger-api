import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import {
    hyphenToCamelCase,
    resolveExportName,
    USAGE_HINTS,
} from '../src/commands/add';

const ECOSYSTEM = join(__dirname, '../../../ecosystem');

describe('hyphenToCamelCase', () => {
    it('converts hyphenated names to camelCase', () => {
        expect(hyphenToCamelCase('jwt-auth')).toBe('jwtAuth');
        expect(hyphenToCamelCase('rate-limiter')).toBe('rateLimiter');
        expect(hyphenToCamelCase('cors')).toBe('cors');
    });
});

describe('resolveExportName', () => {
    // Regression: the directory name does not always match the real export —
    // a package's primary factory may be named differently.
    it('resolves the real primary export, not a guess from the directory name', () => {
        const cases: [string, string, string][] = [
            ['hooks', 'rate-limiter', 'rateLimit'],
            ['hooks', 'compression', 'compress'],
            ['hooks', 'cache', 'cacheControl'],
            ['hooks', 'timeout', 'requestTimeout'],
            ['hooks', 'logger', 'createLogger'],
            ['hooks', 'cors', 'cors'],
            ['hooks', 'security-headers', 'securityHeaders'],
            ['hooks', 'body-size-limiter', 'bodySizeLimiter'],
            ['plugins', 'jwt-auth', 'jwtAuth'],
            ['plugins', 'api-key', 'apiKey'],
            ['plugins', 'basic-auth', 'basicAuth'],
        ];
        for (const [kind, name, expected] of cases) {
            const filePath = join(ECOSYSTEM, kind, name, `${name}.ts`);
            expect(resolveExportName(filePath, name)).toBe(expected);
        }
    });

    it('produces a valid JS identifier even for a hyphenated name', () => {
        for (const name of ['rate-limiter', 'jwt-auth', 'body-size-limiter']) {
            const filePath = join(
                ECOSYSTEM,
                name === 'jwt-auth' ? 'plugins' : 'hooks',
                name,
                `${name}.ts`
            );
            const resolved = resolveExportName(filePath, name);
            expect(resolved).toMatch(/^[A-Za-z_$][\w$]*$/);
        }
    });

    it('falls back to a hyphen->camelCase guess when the file is missing', () => {
        expect(
            resolveExportName('/nonexistent/path/rate-limiter.ts', 'rate-limiter')
        ).toBe('rateLimiter');
    });
});

describe('USAGE_HINTS', () => {
    // Regression: the logger hint called `logger()` but imported
    // `createLogger`, so the pasted code did not compile.
    it('every hint calls a function its package really exports', () => {
        for (const [name, hint] of Object.entries(USAGE_HINTS)) {
            const kind = existsSync(join(ECOSYSTEM, 'hooks', name))
                ? 'hooks'
                : 'plugins';
            const source = readFileSync(
                join(ECOSYSTEM, kind, name, `${name}.ts`),
                'utf-8'
            );
            const fn = hint.call.match(/^[A-Za-z_$][\w$]*/)?.[0];
            expect(fn, name).toBeDefined();
            expect(source, `${name} exports ${fn}`).toMatch(
                new RegExp('export (async )?function ' + fn + '\\s*\\(')
            );
        }
    });
});
