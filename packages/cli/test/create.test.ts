import { describe, expect, it } from 'bun:test';
import { applyFlags, validateProjectName } from '../src/commands/create';
import type { CreateOptions } from '../src/types';

describe('validateProjectName', () => {
    it('accepts normal names', () => {
        expect(validateProjectName('my-api')).toBeUndefined();
        expect(validateProjectName('my_api.v2~x')).toBeUndefined();
        expect(validateProjectName('2fa-service')).toBeUndefined();
    });

    it('rejects empty and oversized names', () => {
        expect(validateProjectName('')).toContain('required');
        expect(validateProjectName('a'.repeat(101))).toContain('too long');
    });

    it('rejects a leading dot or dash', () => {
        expect(validateProjectName('.hidden')).toContain('dot or dash');
        expect(validateProjectName('-api')).toContain('dot or dash');
    });

    it('rejects invalid characters and spaces', () => {
        expect(validateProjectName('my/api')).toContain('invalid characters');
        expect(validateProjectName('my:api')).toContain('invalid characters');
        expect(validateProjectName('my api')).toContain('spaces');
        expect(validateProjectName('my!api')).toContain('may only contain');
    });

    it('rejects Windows reserved device names', () => {
        for (const name of ['con', 'PRN', 'aux', 'nul', 'com1', 'lpt9']) {
            expect(validateProjectName(name)).toContain(
                'reserved device name'
            );
        }
    });

    it('does not treat similar names as reserved', () => {
        expect(validateProjectName('console')).toBeUndefined();
        expect(validateProjectName('com10')).toBeUndefined();
    });
});

describe('applyFlags', () => {
    const base: CreateOptions = {
        name: 'my-api',
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        pageDir: 'pages',
        pagePrefix: '/',
        addSkills: true,
    };

    it('returns the base options untouched with no flags', () => {
        expect(applyFlags(base, {})).toEqual(base);
    });

    it('enables pages, websockets and explicit dirs', () => {
        const out = applyFlags(base, {
            pages: true,
            ws: true,
            apiDir: 'routes',
        });
        expect(out.usePages).toBe(true);
        expect(out.useWs).toBe(true);
        expect(out.apiDir).toBe('routes');
    });

    it('normalizes apiPrefix to start with a slash', () => {
        expect(applyFlags(base, { apiPrefix: 'v1' }).apiPrefix).toBe('/v1');
        expect(applyFlags(base, { apiPrefix: '/v2' }).apiPrefix).toBe('/v2');
    });

    it('--no-api and --no-skills turn features off', () => {
        const out = applyFlags(base, { api: false, skills: false });
        expect(out.useApi).toBe(false);
        expect(out.addSkills).toBe(false);
    });
});
