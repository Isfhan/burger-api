/**
 * Route folder names must be usable in a URL path: ASCII letters, digits,
 * `-`, `_`, `.`, `~`, plus the `[param]`, `[...]` and `(group)` conventions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

let root: string;

beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'burger-folder-name-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function routeAt(folder: string): void {
    const dir = path.join(root, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'route.ts'), `export const GET = () => new Response('ok');`);
}

describe('route folder name validation', () => {
    for (const name of ['a b', 'café']) {
        it(`rejects the unusable folder "${name}"`, async () => {
            routeAt(name);
            await expect(new DirectoryScanner(root).scan()).rejects.toThrow(
                `Unusable route folder name '${name}'`
            );
            await expect(new DirectoryScanner(root).scan()).rejects.toThrow(
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
        const result = await new DirectoryScanner(root).scan();
        expect(result.routes).toHaveLength(5);
    });

    it('rejects an in-memory route path with an unusable segment', () => {
        const router = new Router();
        const defs = [
            {
                path: '/api/a b',
                handlers: { GET: () => new Response('ok') },
            } as unknown as RouteDefinition,
        ];
        expect(() => router.compile(defs)).toThrow(
            "Unusable route path segment 'a b' in '/api/a b'"
        );
    });
});
