/**
 * The CLI build scanner applies the same route folder name rule as the
 * framework scanner.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { scanApiRoutes } from '../src/utils/scanner';

let root: string;
let apiDir: string;

beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'burger-cli-folder-name-'));
    apiDir = path.join(root, 'api');
    mkdirSync(apiDir, { recursive: true });
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function routeAt(folder: string): void {
    const dir = path.join(apiDir, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'route.ts'), `export const GET = () => new Response('ok');`);
}

describe('CLI route folder name validation', () => {
    for (const name of ['a b', 'café']) {
        it(`rejects the unusable folder "${name}"`, async () => {
            routeAt(name);
            await expect(scanApiRoutes(root, 'api', '/api')).rejects.toThrow(
                `Unusable route folder name '${name}'`
            );
            await expect(scanApiRoutes(root, 'api', '/api')).rejects.toThrow(
                "use only letters, digits and - . _ ~ ! $ & ' * + , ; = : @ (spaces and non-ASCII characters can never match a request)"
            );
        });
    }

    it('accepts letters, digits, - _ . ~ and the convention folders', async () => {
        for (const name of [
            'valid-name_1.2~',
            '[id]',
            '[...]',
            '(group)',
            '@me',
        ]) {
            routeAt(name);
        }
        const routes = await scanApiRoutes(root, 'api', '/api');
        expect(routes).toHaveLength(5);
    });
});
