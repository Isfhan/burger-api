/**
 * Regression tests for bugs in the files `burger-api build` generates:
 * entry-options prelude stripping, import-specifier quoting, `@ts-nocheck`
 * on portable entries, and the dropped-options warning.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    cleanupEntryOptionsModule,
    prepareEntryOptionsModule,
} from '../src/utils/entry-options';
import { generateVirtualEntrySource } from '../src/utils/virtual-entry';
import type { BuildConfig } from '../src/types/index';

const config: BuildConfig = {
    apiDir: './api',
    pageDir: './pages',
    apiPrefix: '/api',
    pagePrefix: '/',
    debug: false,
};

const routeEntry = {
    importPath: '/tmp/api/route.ts',
    routePath: '/api',
    isWildcard: false,
};

/** Parse the generated TS the way a bundler/platform toolchain would. */
const transpiler = new Bun.Transpiler({ loader: 'ts' });

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function projectWithEntry(source: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'burger-c1-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'index.ts'), source, 'utf-8');
    return dir;
}

/** Every import specifier in the generated source, evaluated as a string. */
function evaluatedImportSpecifiers(source: string): string[] {
    return source
        .split('\n')
        .filter((line) => line.startsWith('import '))
        .map(
            (line) =>
                new Function(
                    `return ${line.slice(line.lastIndexOf(' from ') + 6).replace(/;$/, '')};`
                )() as string
        );
}

describe('generated entry-options module', () => {
    it('strips `export` from `export const app = new Burger({...})` (prelude must not leak a bare export)', () => {
        const dir = projectWithEntry(
            [
                "import { Burger } from 'burger-api';",
                '',
                "const title = 'Export Const API';",
                '',
                'export const app = new Burger({',
                '  title,',
                '});',
                '',
                'app.serve(4000);',
                '',
            ].join('\n')
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });
        try {
            expect(result.tempFilePath).toBeDefined();
            const tempSource = readFileSync(result.tempFilePath!, 'utf-8');

            // A stale `export` line produced "Unexpected export" in the
            // build; only the options export may remain.
            const exportLines = tempSource
                .split('\n')
                .filter((line) => /^\s*export\b/.test(line));
            expect(exportLines).toEqual(['export const burgerOptions = {']);
            expect(() => transpiler.transformSync(tempSource)).not.toThrow();
            expect(tempSource).toContain("const title = 'Export Const API';");
        } finally {
            cleanupEntryOptionsModule(result.tempFilePath);
        }
    });

    it('warns once when the constructor argument is not an inline object literal', () => {
        const dir = projectWithEntry(
            [
                "import { Burger } from 'burger-api';",
                "const options = { title: 'API' };",
                'const app = new Burger(options);',
                'app.serve(4000);',
                '',
            ].join('\n')
        );

        const logs: string[] = [];
        const spy = spyOn(console, 'log').mockImplementation(
            (...args: unknown[]) => {
                logs.push(args.map((arg) => String(arg)).join(' '));
            }
        );
        try {
            const result = prepareEntryOptionsModule({
                cwd: dir,
                entryFile: './index.ts',
            });

            // Behavior is unchanged: the build still runs without the options.
            expect(result.importPath).toBeUndefined();
            expect(result.tempFilePath).toBeUndefined();
        } finally {
            spy.mockRestore();
        }

        const warnings = logs.filter((line) =>
            line.includes('inline object literal')
        );
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('./index.ts');
        expect(warnings[0]).toContain('not applied to the build');
        expect(warnings[0]).toContain('inline');
    });

    it('emits `// @ts-nocheck` as the first line so the scaffold typecheck passes', () => {
        const dir = projectWithEntry(
            [
                "import { Burger } from 'burger-api';",
                'const app = new Burger({ title: 1 as any });',
                '',
            ].join('\n')
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });
        try {
            const tempSource = readFileSync(result.tempFilePath!, 'utf-8');
            expect(tempSource.split('\n')[0]).toBe('// @ts-nocheck');
        } finally {
            cleanupEntryOptionsModule(result.tempFilePath);
        }
    });
});

describe('generated virtual entry import specifiers', () => {
    it('quotes every specifier so an apostrophe in a path cannot break the entry', () => {
        const base = "C:\\Users\\O'Brien\\app";
        const routePath = `${base}\\src\\api\\o'clock\\route.ts`;
        const hooksPath = `${base}\\src\\api\\o'clock\\hooks.ts`;
        const schemaPath = `${base}\\src\\api\\o'clock\\schema.ts`;
        const openapiPath = `${base}\\src\\api\\o'clock\\openapi.ts`;
        const configPath = `${base}\\src\\api\\o'clock\\config.ts`;
        const pagePath = `${base}\\src\\pages\\o'clock.html`;
        const wsPath = `${base}\\src\\websocket\\o'clock\\ws.ts`;
        const wsHooksPath = `${base}\\src\\websocket\\o'clock\\hooks.ts`;
        const wsConfigPath = `${base}\\src\\websocket\\o'clock\\config.ts`;
        const optionsPath = `${base}\\src\\__burger_build_options__.ts`;
        const appHooksPath = `${base}\\src\\hooks.ts`;
        const pluginsPath = `${base}\\src\\plugins.ts`;
        const providersPath = `${base}\\src\\providers.ts`;
        const openapiConfigPath = `${base}\\src\\openapi.config.ts`;

        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: routePath,
                    routePath: '/api',
                    isWildcard: false,
                    hooksPath,
                    schemaPath,
                    openapiPath,
                    configPath,
                },
            ],
            [{ importPath: pagePath, routePath: '/' }],
            optionsPath,
            {
                hooksPath: appHooksPath,
                pluginsPath,
                providersPath,
                openapiConfigPath,
            },
            [
                {
                    importPath: wsPath,
                    routePath: '/ws',
                    hooksPath: wsHooksPath,
                    configPath: wsConfigPath,
                },
            ],
            [],
            false,
            'vercel'
        );

        expect(() => transpiler.transformSync(source)).not.toThrow();

        const specifiers = evaluatedImportSpecifiers(source);
        for (const path of [
            routePath,
            hooksPath,
            schemaPath,
            openapiPath,
            configPath,
            pagePath,
            wsPath,
            wsHooksPath,
            wsConfigPath,
            optionsPath,
            appHooksPath,
            pluginsPath,
            providersPath,
            openapiConfigPath,
        ]) {
            expect(specifiers).toContain(path);
        }
    });
});

describe('generated portable entries', () => {
    for (const target of ['vercel', 'cloudflare', 'deno'] as const) {
        it(`target=${target}: starts with // @ts-nocheck so the scaffold typecheck passes`, () => {
            const source = generateVirtualEntrySource(
                config,
                [routeEntry],
                [],
                undefined,
                undefined,
                [],
                [],
                false,
                target
            );

            expect(source.split('\n')[0]).toBe('// @ts-nocheck');
            expect(() => transpiler.transformSync(source)).not.toThrow();
        });
    }

    it('non-portable entries (bun, node) keep no @ts-nocheck', () => {
        for (const target of ['bun', 'node'] as const) {
            const source = generateVirtualEntrySource(
                config,
                [routeEntry],
                [],
                undefined,
                undefined,
                [],
                [],
                false,
                target
            );
            expect(source.split('\n')[0]).toBe(
                '// Auto-generated by burger-api build. Do not edit.'
            );
        }
    });
});
