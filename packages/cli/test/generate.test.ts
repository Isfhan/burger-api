/**
 * generate command templates and route scaffolding.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
    generateRouteFiles,
    generateHookTemplate,
    generatePluginTemplate,
    generateWsFiles,
} from '../src/utils/templates';

const tmpDir = join(import.meta.dir, '__tmp_generate');

beforeEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
});

describe('generateRouteFiles', () => {
    it('generates all convention files by default', () => {
        const files = generateRouteFiles('users');
        expect(files['route.ts']).toBeDefined();
        expect(files['schema.ts']).toBeDefined();
        expect(files['openapi.ts']).toBeDefined();
        expect(files['hooks.ts']).toBeDefined();
        expect(files['config.ts']).toBeDefined();
    });

    it('route.ts contains GET handler', () => {
        const files = generateRouteFiles('users');
        expect(files['route.ts']).toContain('export async function GET');
        expect(files['route.ts']).toContain('BurgerContext');
        expect(files['route.ts']).toContain('Response.json');
    });

    it('schema.ts contains Zod import and GET export', () => {
        const files = generateRouteFiles('users');
        expect(files['schema.ts']).toContain("import { z } from 'zod/v4'");
        expect(files['schema.ts']).toContain('export const GET');
    });

    it('openapi.ts contains route name in summary and tags', () => {
        const files = generateRouteFiles('users');
        expect(files['openapi.ts']).toContain("summary: 'users endpoint'");
        expect(files['openapi.ts']).toContain("tags: ['users']");
    });

    it('hooks.ts contains beforeRoute hook', () => {
        const files = generateRouteFiles('users');
        expect(files['hooks.ts']).toContain(
            'export async function beforeRoute'
        );
        expect(files['hooks.ts']).toContain('BurgerContext');
    });

    it('config.ts contains auth: false', () => {
        const files = generateRouteFiles('users');
        expect(files['config.ts']).toContain('auth: false');
    });

    it('respects --no-schema flag', () => {
        const files = generateRouteFiles('users', { schema: false });
        expect(files['schema.ts']).toBeUndefined();
        expect(files['route.ts']).toBeDefined();
    });

    it('respects --no-openapi flag', () => {
        const files = generateRouteFiles('users', { openapi: false });
        expect(files['openapi.ts']).toBeUndefined();
    });

    it('respects --no-hooks flag', () => {
        const files = generateRouteFiles('users', { hooks: false });
        expect(files['hooks.ts']).toBeUndefined();
    });

    it('respects --no-config flag', () => {
        const files = generateRouteFiles('users', { config: false });
        expect(files['config.ts']).toBeUndefined();
    });

    it('respects multiple --no-* flags', () => {
        const files = generateRouteFiles('users', {
            schema: false,
            openapi: false,
            hooks: false,
            config: false,
        });
        expect(Object.keys(files)).toEqual(['route.ts']);
    });

    it('handles nested route paths like products/[id]', () => {
        const files = generateRouteFiles('products/[id]');
        expect(files['route.ts']).toBeDefined();
        expect(files['openapi.ts']).toContain("tags: ['products/[id]']");
    });
});

describe('generateHookTemplate', () => {
    it('generates a hook factory with the given name', () => {
        const content = generateHookTemplate('cors');
        expect(content).toContain('export function cors()');
        expect(content).toContain('BurgerContext');
        expect(content).toContain('Import and register in src/hooks.ts');
    });

    it('includes JSDoc with hook name', () => {
        const content = generateHookTemplate('rateLimiter');
        expect(content).toContain('* rateLimiter hook factory');
    });
});

describe('generatePluginTemplate', () => {
    it('generates a plugin with the given name', () => {
        const content = generatePluginTemplate('jwt');
        expect(content).toContain("name: 'jwt'");
        expect(content).toContain('Plugin');
        expect(content).toContain('Import and register in src/plugins.ts');
    });

    it('capitalizes the class name', () => {
        const content = generatePluginTemplate('jwt');
        expect(content).toContain('export const Jwt');
    });

    it('includes hooks object', () => {
        const content = generatePluginTemplate('session');
        expect(content).toContain('hooks: {');
    });
});

describe('generate route files to disk', () => {
    it('writes all files to the target directory', async () => {
        const targetDir = join(tmpDir, 'users');
        await mkdir(targetDir, { recursive: true });

        const files = generateRouteFiles('users');
        for (const [filename, content] of Object.entries(files)) {
            await Bun.write(join(targetDir, filename), content);
        }

        const written = await readdir(targetDir);
        expect(written).toContain('route.ts');
        expect(written).toContain('schema.ts');
        expect(written).toContain('openapi.ts');
        expect(written).toContain('hooks.ts');
        expect(written).toContain('config.ts');

        const routeContent = await readFile(
            join(targetDir, 'route.ts'),
            'utf-8'
        );
        expect(routeContent).toContain('export async function GET');
    });
});

describe('generateWsFiles', () => {
    it('generates all convention files by default', () => {
        const files = generateWsFiles('chat');
        expect(files['ws.ts']).toBeDefined();
        expect(files['hooks.ts']).toBeDefined();
        expect(files['config.ts']).toBeDefined();
    });

    it('ws.ts contains open, message, close handlers', () => {
        const files = generateWsFiles('chat');
        expect(files['ws.ts']).toContain('export function open');
        expect(files['ws.ts']).toContain('export function message');
        expect(files['ws.ts']).toContain('export function close');
        expect(files['ws.ts']).toContain('BurgerWS');
    });

    it('hooks.ts contains onOpen, onMessage, onClose', () => {
        const files = generateWsFiles('chat');
        expect(files['hooks.ts']).toContain('export function onOpen');
        expect(files['hooks.ts']).toContain('export function onMessage');
        expect(files['hooks.ts']).toContain('export function onClose');
    });

    it('config.ts contains WebSocket config options', () => {
        const files = generateWsFiles('chat');
        expect(files['config.ts']).toContain('maxPayloadLength');
        expect(files['config.ts']).toContain('idleTimeout');
    });

    it('respects --no-hooks flag', () => {
        const files = generateWsFiles('chat', { hooks: false });
        expect(files['hooks.ts']).toBeUndefined();
        expect(files['ws.ts']).toBeDefined();
        expect(files['config.ts']).toBeDefined();
    });

    it('respects --no-config flag', () => {
        const files = generateWsFiles('chat', { config: false });
        expect(files['config.ts']).toBeUndefined();
        expect(files['ws.ts']).toBeDefined();
        expect(files['hooks.ts']).toBeDefined();
    });

    it('respects multiple --no-* flags', () => {
        const files = generateWsFiles('chat', { hooks: false, config: false });
        expect(Object.keys(files)).toEqual(['ws.ts']);
    });

    it('handles nested paths like notifications/[room]', () => {
        const files = generateWsFiles('notifications/[room]');
        expect(files['ws.ts']).toBeDefined();
        expect(files['ws.ts']).toContain('export function open');
    });
});
