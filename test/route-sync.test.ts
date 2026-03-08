/**
 * Route sync test: CLI and framework path conversion must produce identical results.
 * Run from repo root: bun run test:route-sync
 * When changing route logic in either package, update the other to match.
 */
import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import {
    filePathToApiRoutePath as cliApi,
    filePathToPageRoutePath as cliPage,
} from '../packages/cli/src/utils/route-conventions';
import {
    filePathToApiRoutePath as fwApi,
    filePathToPageRoutePath as fwPage,
} from '../packages/burger-api/src/utils/pathConversion';

const s = path.sep;

const apiCases: { filePath: string; prefix: string }[] = [
    { filePath: `api${s}route.ts`, prefix: '/api' },
    { filePath: `api${s}route.ts`, prefix: 'api' },
    { filePath: `api${s}route.ts`, prefix: '//api//' },
    { filePath: `api${s}users${s}[id]${s}route.ts`, prefix: '/api' },
    { filePath: `api${s}files${s}[...]${s}route.ts`, prefix: '/api' },
    { filePath: `api${s}groups${s}(admin)${s}users${s}route.ts`, prefix: '/api' },
    { filePath: `api${s}root${s}route.ts`, prefix: '/api' },
    { filePath: `api${s}blog${s}[slug]${s}route.ts`, prefix: '' },
];

const pageCases: { filePath: string; prefix: string }[] = [
    { filePath: `index.html`, prefix: '' },
    { filePath: `index.html`, prefix: '/' },
    { filePath: `index.tsx`, prefix: '' },
    { filePath: `about.html`, prefix: '' },
    { filePath: `blog${s}[slug]${s}index.html`, prefix: '' },
    { filePath: `docs${s}guides${s}getting-started.html`, prefix: '' },
    { filePath: `(marketing)${s}landing.html`, prefix: '' },
    { filePath: `(marketing)${s}landing.html`, prefix: '/site' },
    { filePath: `user${s}[id]${s}index.tsx`, prefix: '/' },
];

describe('route sync: CLI vs framework path conversion', () => {
    describe('filePathToApiRoutePath', () => {
        for (const { filePath, prefix } of apiCases) {
            it(`matches for ${filePath} with prefix "${prefix}"`, () => {
                const cliResult = cliApi(filePath, prefix);
                const fwResult = fwApi(filePath, prefix);
                expect(cliResult).toBe(fwResult);
            });
        }
    });

    describe('filePathToPageRoutePath', () => {
        for (const { filePath, prefix } of pageCases) {
            it(`matches for ${filePath} with prefix "${prefix}"`, () => {
                const cliResult = cliPage(filePath, prefix);
                const fwResult = fwPage(filePath, prefix);
                expect(cliResult).toBe(fwResult);
            });
        }
    });
});
