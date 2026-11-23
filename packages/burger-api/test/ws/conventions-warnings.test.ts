import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocketScanner } from '../../src/ws/scanner';

/**
 * A WebSocket folder with `hooks.*` / `config.*` but no `ws.*` applies to
 * nothing — nothing is inherited by child routes, so the scanner warns.
 */

const spies: { mockRestore(): void }[] = [];

afterEach(() => {
    while (spies.length) spies.pop()!.mockRestore();
});

function captureWarnings(): string[] {
    const messages: string[] = [];
    spies.push(
        spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
            messages.push(args.map(String).join(' '));
        })
    );
    return messages;
}

describe('WebSocketScanner — convention files without ws.ts', () => {
    let root: string;

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('warns once for a group folder and still scans its child route', async () => {
        root = mkdtempSync(join(tmpdir(), 'burger-ws-warn-'));
        mkdirSync(join(root, '(auth)', 'chat'), { recursive: true });
        writeFileSync(join(root, '(auth)', 'hooks.ts'), 'export {};');
        writeFileSync(join(root, '(auth)', 'config.ts'), 'export default {};');
        writeFileSync(join(root, '(auth)', 'chat', 'ws.ts'), 'export default {};');
        const warnings = captureWarnings();

        const result = await new WebSocketScanner(root).scan();

        expect(result.routes.map((r) => r.path)).toEqual(['/chat']);
        const ours = warnings.filter(
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
        root = mkdtempSync(join(tmpdir(), 'burger-ws-warn-'));
        mkdirSync(join(root, 'chat'), { recursive: true });
        writeFileSync(join(root, 'chat', 'ws.ts'), 'export default {};');
        writeFileSync(join(root, 'chat', 'hooks.ts'), 'export {};');
        writeFileSync(
            join(root, 'chat', 'config.ts'),
            'export default {};'
        );
        const warnings = captureWarnings();

        const result = await new WebSocketScanner(root).scan();

        expect(result.routes.map((r) => r.path)).toEqual(['/chat']);
        expect(warnings.filter((m) => m.includes('[burger-api]'))).toHaveLength(
            0
        );
    });
});
