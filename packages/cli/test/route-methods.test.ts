import { describe, expect, it } from 'bun:test';
import { join } from 'path';
import { detectExportedMethods } from '../src/utils/route-methods';

const fixturesDir = join(import.meta.dir, 'fixtures', 'route-methods');

describe('detectExportedMethods', () => {
    it('detects GET and POST from export async function / export function', async () => {
        const path = join(fixturesDir, 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods!.sort()).toEqual(['GET', 'POST']);
    });

    it('detects only GET when that is the only export', async () => {
        const path = join(fixturesDir, 'get-only', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods).toEqual(['GET']);
    });

    it('detects GET and POST from a single export { GET, POST } block', async () => {
        const path = join(fixturesDir, 'named-export-block', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods!.sort()).toEqual(['GET', 'POST']);
    });

    it('detects GET and POST from export const METHOD = ...', async () => {
        const path = join(fixturesDir, 'const-exports', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods!.sort()).toEqual(['GET', 'POST']);
    });

    it('detects both GET and POST when route mixes export const GET and export function POST', async () => {
        const path = join(fixturesDir, 'mixed', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods!.sort()).toEqual(['GET', 'POST']);
    });

    it('returns undefined for non-existent file', async () => {
        const methods = await detectExportedMethods(
            join(fixturesDir, 'nonexistent', 'route.ts')
        );
        expect(methods).toBeUndefined();
    });

    it('ignores commented-out exports and returns undefined when only comments export methods', async () => {
        const path = join(fixturesDir, 'commented-only', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeUndefined();
    });

    it('detects only real export when another method is commented out', async () => {
        const path = join(fixturesDir, 'commented-export', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods).toEqual(['GET']);
    });

    it('ignores exports inside block comments and detects only real export', async () => {
        const path = join(fixturesDir, 'block-comment', 'route.ts');
        const methods = await detectExportedMethods(path);
        expect(methods).toBeDefined();
        expect(methods).toEqual(['POST']);
    });
});
