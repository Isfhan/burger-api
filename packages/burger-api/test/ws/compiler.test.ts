import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WebSocketCompiler } from '../../src/ws/compiler';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ScannedWebSocketRoute } from '../../src/ws/scanner';

describe('WebSocketCompiler (Phase 9)', () => {
    let tempDir: string;
    let compiler: WebSocketCompiler;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'burger-ws-compiler-'));
        compiler = new WebSocketCompiler();
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    const createScannedRoute = (overrides: Partial<ScannedWebSocketRoute> = {}): ScannedWebSocketRoute => ({
        path: '/',
        wsFile: join(tempDir, 'ws.ts'),
        ...overrides,
    });

    it('should compile a basic ws.ts file', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
            export const message = (ws, msg) => {};
            export const close = (ws, code, reason) => {};
        `);

        const scanned = createScannedRoute();
        const compiled = await compiler.compile(scanned);

        expect(compiled.path).toBe('/');
        expect(compiled.handlers.open).toBeDefined();
        expect(compiled.handlers.message).toBeDefined();
        expect(compiled.handlers.close).toBeDefined();
    });

    it('should compile ws.ts with hooks', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
        `);

        writeFileSync(join(tempDir, 'hooks.ts'), `
            export const onOpen = (ws) => {};
            export const onMessage = (ws, msg) => {};
        `);

        const scanned = createScannedRoute({
            hooksFile: join(tempDir, 'hooks.ts'),
        });
        const compiled = await compiler.compile(scanned);

        expect(compiled.hooks?.onOpen).toBeDefined();
        expect(compiled.hooks?.onMessage).toBeDefined();
    });

    it('should compile ws.ts with config', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
        `);

        writeFileSync(join(tempDir, 'config.ts'), `
            export const maxPayloadLength = 2048;
            export const idleTimeout = 60;
        `);

        const scanned = createScannedRoute({
            configFile: join(tempDir, 'config.ts'),
        });
        const compiled = await compiler.compile(scanned);

        expect(compiled.config.maxPayloadLength).toBe(2048);
        expect(compiled.config.idleTimeout).toBe(60);
    });

    it('should merge global and route-specific config', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
        `);

        writeFileSync(join(tempDir, 'config.ts'), `
            export const maxPayloadLength = 2048;
        `);

        compiler.setGlobalConfig({ maxPayloadLength: 1024, idleTimeout: 30 });

        const scanned = createScannedRoute({
            configFile: join(tempDir, 'config.ts'),
        });
        const compiled = await compiler.compile(scanned);

        // Route config should override global
        expect(compiled.config.maxPayloadLength).toBe(2048);
        expect(compiled.config.idleTimeout).toBe(30);
    });

    it('should merge global and route-specific hooks', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
        `);

        writeFileSync(join(tempDir, 'hooks.ts'), `
            export const onOpen = (ws) => {};
        `);

        const globalOnOpen = (ws: any) => {};
        compiler.setGlobalHooks({ onOpen: globalOnOpen });

        const scanned = createScannedRoute({
            hooksFile: join(tempDir, 'hooks.ts'),
        });
        const compiled = await compiler.compile(scanned);

        // Both hooks should be merged
        expect(compiled.hooks?.onOpen).toBeDefined();
    });

    it('should compile multiple routes', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
        `);

        const routes = [
            createScannedRoute({ path: '/' }),
            createScannedRoute({ path: '/chat' }),
            createScannedRoute({ path: '/notifications' }),
        ];

        const compiled = await compiler.compileAll(routes);

        expect(compiled).toHaveLength(3);
    });

    it('should skip failed routes gracefully', async () => {
        // Create a valid route
        writeFileSync(join(tempDir, 'valid.ts'), `
            export const open = (ws) => {};
        `);

        const routes = [
            createScannedRoute({ path: '/', wsFile: join(tempDir, 'valid.ts') }),
            createScannedRoute({ path: '/bad', wsFile: '/nonexistent/file.ts' }),
        ];

        const compiled = await compiler.compileAll(routes);

        // Should only include the valid route
        expect(compiled).toHaveLength(1);
        expect(compiled[0].path).toBe('/');
    });

    it('should preserve route params', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
        `);

        const scanned = createScannedRoute({
            path: '/chat/:room',
            params: { room: 'room' },
        });
        const compiled = await compiler.compile(scanned);

        expect(compiled.params).toEqual({ room: 'room' });
    });

    it('should compile all handler types', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), `
            export const open = (ws) => {};
            export const message = (ws, msg) => {};
            export const close = (ws, code, reason) => {};
            export const drain = (ws) => {};
            export const ping = (ws) => {};
            export const pong = (ws) => {};
        `);

        const scanned = createScannedRoute();
        const compiled = await compiler.compile(scanned);

        expect(compiled.handlers.open).toBeDefined();
        expect(compiled.handlers.message).toBeDefined();
        expect(compiled.handlers.close).toBeDefined();
        expect(compiled.handlers.drain).toBeDefined();
        expect(compiled.handlers.ping).toBeDefined();
        expect(compiled.handlers.pong).toBeDefined();
    });
});
