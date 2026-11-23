/**
 * Build-time scanners warn when a folder has convention files but no
 * `route.*` / `ws.*` — those files apply to nothing, because routes do not
 * inherit from parent folders.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanApiRoutes, scanWebSocketRoutes } from '../src/utils/scanner';

const spies: { mockRestore(): void }[] = [];

afterEach(() => {
    while (spies.length) spies.pop()!.mockRestore();
});

function captureLogs(): string[] {
    const messages: string[] = [];
    spies.push(
        spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            messages.push(args.map(String).join(' '));
        })
    );
    return messages;
}

function write(root: string, rel: string, contents = 'export {};'): void {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
}

describe('CLI scanner — convention files without route.ts', () => {
    let root: string;

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('warns once for a group folder but still returns its child route', async () => {
        root = mkdtempSync(join(tmpdir(), 'burger-cli-warn-'));
        write(root, 'api/(auth)/hooks.ts');
        write(root, 'api/(auth)/config.ts', 'export default {};');
        write(
            root,
            'api/(auth)/me/route.ts',
            'export const GET = () => new Response("me");'
        );
        const logs = captureLogs();

        const entries = await scanApiRoutes(root, './api', '/api');

        expect(entries.map((e) => e.routePath)).toEqual(['/api/me']);
        const ours = logs.filter(
            (m) => m.includes('[burger-api]') && m.includes('(auth)')
        );
        expect(ours).toHaveLength(1);
        const warning = ours[0] ?? '';
        expect(warning).toContain('(auth) has');
        expect(warning).toContain('hooks.ts');
        expect(warning).toContain('config.ts');
        expect(warning).toContain('but no route.ts, so they apply to nothing');
        expect(warning).toContain(
            'Convention files are not inherited by child routes'
        );
    });

    it('does not warn when route.ts sits next to the convention files', async () => {
        root = mkdtempSync(join(tmpdir(), 'burger-cli-warn-'));
        write(root, 'api/users/route.ts');
        write(root, 'api/users/hooks.ts');
        write(root, 'api/users/config.ts', 'export default {};');
        const logs = captureLogs();

        const entries = await scanApiRoutes(root, './api', '/api');

        expect(entries.map((e) => e.routePath)).toEqual(['/api/users']);
        expect(logs.filter((m) => m.includes('[burger-api]'))).toHaveLength(0);
    });
});

describe('CLI scanner — convention files without ws.ts', () => {
    let root: string;

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('warns once for a group folder but still returns its child route', async () => {
        root = mkdtempSync(join(tmpdir(), 'burger-cli-ws-warn-'));
        write(root, 'websocket/(auth)/hooks.ts');
        write(root, 'websocket/(auth)/config.ts', 'export default {};');
        write(root, 'websocket/(auth)/chat/ws.ts', 'export default {};');
        const logs = captureLogs();

        const entries = await scanWebSocketRoutes(root, './websocket');

        expect(entries.map((e) => e.routePath)).toEqual(['/chat']);
        const ours = logs.filter(
            (m) => m.includes('[burger-api]') && m.includes('(auth)')
        );
        expect(ours).toHaveLength(1);
        const warning = ours[0] ?? '';
        expect(warning).toContain('(auth) has');
        expect(warning).toContain('hooks.ts');
        expect(warning).toContain('config.ts');
        expect(warning).toContain('but no ws.ts, so they apply to nothing');
        expect(warning).toContain(
            'Convention files are not inherited by child routes'
        );
    });

    it('does not warn when ws.ts sits next to the convention files', async () => {
        root = mkdtempSync(join(tmpdir(), 'burger-cli-ws-warn-'));
        write(root, 'websocket/chat/ws.ts', 'export default {};');
        write(root, 'websocket/chat/hooks.ts');
        const logs = captureLogs();

        const entries = await scanWebSocketRoutes(root, './websocket');

        expect(entries.map((e) => e.routePath)).toEqual(['/chat']);
        expect(logs.filter((m) => m.includes('[burger-api]'))).toHaveLength(0);
    });
});
