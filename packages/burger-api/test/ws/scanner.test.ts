import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WebSocketScanner } from '../../src/ws/scanner';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('WebSocketScanner', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'burger-ws-scanner-'));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('should throw error if wsDir is empty', () => {
        expect(() => new WebSocketScanner('')).toThrow(
            'WebSocket directory path is required'
        );
    });

    it('should return empty routes for empty directory', async () => {
        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes).toEqual([]);
    });

    it('should find ws.ts files', async () => {
        // Create ws.ts file
        writeFileSync(join(tempDir, 'ws.ts'), 'export default {};');

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes).toHaveLength(1);
        expect(result.routes[0].wsFile).toContain('ws.ts');
        expect(result.routes[0].path).toBe('/');
    });

    it('should find ws.ts in nested directories', async () => {
        // Create nested structure
        mkdirSync(join(tempDir, 'chat'), { recursive: true });
        writeFileSync(join(tempDir, 'chat', 'ws.ts'), 'export default {};');

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes).toHaveLength(1);
        expect(result.routes[0].path).toBe('/chat');
    });

    it('should find hooks.ts alongside ws.ts', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), 'export default {};');
        writeFileSync(
            join(tempDir, 'hooks.ts'),
            'export const onOpen = () => {};'
        );

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes[0].hooksFile).toContain('hooks.ts');
    });

    it('should find config.ts alongside ws.ts', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), 'export default {};');
        writeFileSync(
            join(tempDir, 'config.ts'),
            'export default { maxPayloadLength: 1024 };'
        );

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes[0].configFile).toContain('config.ts');
    });

    it('should detect global hooks in parent directory', async () => {
        // Create websocket dir
        mkdirSync(join(tempDir, 'websocket'), { recursive: true });
        writeFileSync(
            join(tempDir, 'websocket', 'ws.ts'),
            'export default {};'
        );

        // Create hooks.ts in parent directory
        writeFileSync(
            join(tempDir, 'hooks.ts'),
            'export const onOpen = () => {};'
        );

        const scanner = new WebSocketScanner(join(tempDir, 'websocket'));
        const result = await scanner.scan();

        expect(result.globalHooks).toContain('hooks.ts');
    });

    it('should handle dynamic parameter folders', async () => {
        mkdirSync(join(tempDir, '[room]'), { recursive: true });
        writeFileSync(join(tempDir, '[room]', 'ws.ts'), 'export default {};');

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes[0].path).toBe('/:room');
        expect(result.routes[0].params).toEqual({ room: 'room' });
    });

    it('should handle wildcard folders', async () => {
        mkdirSync(join(tempDir, '[...]'), { recursive: true });
        writeFileSync(join(tempDir, '[...]', 'ws.ts'), 'export default {};');

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes[0].path).toBe('/*');
        expect(result.routes[0].isWildcard).toBe(true);
    });

    it('should handle group directories', async () => {
        mkdirSync(join(tempDir, '(api)'), { recursive: true });
        writeFileSync(join(tempDir, '(api)', 'ws.ts'), 'export default {};');

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes[0].isGroup).toBe(true);
        expect(result.routes[0].groupName).toBe('api');
        // Group directories don't affect the URL
        expect(result.routes[0].path).toBe('/');
    });

    it('should handle complex nested structure', async () => {
        // Create complex structure
        mkdirSync(join(tempDir, 'chat'), { recursive: true });
        mkdirSync(join(tempDir, 'chat', '[roomId]'), { recursive: true });
        mkdirSync(join(tempDir, 'notifications'), { recursive: true });

        writeFileSync(join(tempDir, 'chat', 'ws.ts'), 'export default {};');
        writeFileSync(
            join(tempDir, 'chat', '[roomId]', 'ws.ts'),
            'export default {};'
        );
        writeFileSync(
            join(tempDir, 'notifications', 'ws.ts'),
            'export default {};'
        );

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes).toHaveLength(3);
        expect(result.routes.map((r) => r.path).sort()).toEqual([
            '/chat',
            '/chat/:roomId',
            '/notifications',
        ]);
    });

    it('should ignore non-ws.ts files', async () => {
        writeFileSync(join(tempDir, 'index.ts'), 'export {};');
        writeFileSync(join(tempDir, 'helper.ts'), 'export {};');

        const scanner = new WebSocketScanner(tempDir);
        const result = await scanner.scan();

        expect(result.routes).toEqual([]);
    });

    it('should handle prefix option', async () => {
        writeFileSync(join(tempDir, 'ws.ts'), 'export default {};');

        const scanner = new WebSocketScanner(tempDir, 'ws');
        const result = await scanner.scan();

        expect(result.routes[0].path).toBe('/ws/');
    });
});
