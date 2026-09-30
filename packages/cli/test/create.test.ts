import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { applyFlags, validateProjectName } from '../src/commands/create';
import { createProject } from '../src/utils/templates';
import type { CreateOptions } from '../src/types';
import { baseCreateOptions, makeTempDir, removeDir } from './test-utils';

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

describe('create scaffolds src/types.ts for TS projects only', () => {
    it('writes a commented module-augmentation example', async () => {
        const dir = makeTempDir('burger-types-');
        try {
            await createProject(dir, baseCreateOptions({ name: 'typed-app' }));

            const types = readFileSync(join(dir, 'src', 'types.ts'), 'utf8');
            expect(types).toContain("declare module 'burger-api'");
            expect(types).toContain('interface RouteConfig');
            expect(types).toContain('interface BurgerServices');
            // Kept a module so uncommenting the augmentation works.
            expect(types).toContain('export {};');
            // Everything in the example is commented out, so the fresh
            // scaffold typechecks as-is.
            expect(types).not.toMatch(/^\s*(declare|interface)/m);
        } finally {
            removeDir(dir);
        }
    });

    it('does not write src/types.ts for JS projects', async () => {
        const dir = makeTempDir('burger-types-js-');
        try {
            await createProject(
                dir,
                baseCreateOptions({ name: 'js-app', lang: 'js' })
            );

            expect(existsSync(join(dir, 'src', 'types.ts'))).toBe(false);
        } finally {
            removeDir(dir);
        }
    });
});
