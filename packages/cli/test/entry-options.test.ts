import { afterEach, describe, expect, it } from 'bun:test';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    cleanupEntryOptionsModule,
    findDroppedEntryCode,
    prepareEntryOptionsModule,
} from '../src/utils/entry-options';

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('prepareEntryOptionsModule', () => {
    it('extracts and writes Burger constructor options from entry file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        const entryPath = join(dir, 'index.ts');
        writeFileSync(
            entryPath,
            `
import { Burger } from 'burger-api';
import { hostname } from './settings';

const title = 'My API';

const app = new Burger({
  title,
  description: 'desc',
  version: '1.2.3',
  hostname,
});

app.serve(4000);
`,
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeDefined();
        expect(result.tempFilePath).toBeDefined();
        expect(existsSync(result.tempFilePath!)).toBe(true);

        const tempSource = readFileSync(result.tempFilePath!, 'utf-8');
        expect(tempSource).toContain("import { Burger } from 'burger-api';");
        expect(tempSource).toContain(
            "import { hostname } from './settings';"
        );
        expect(tempSource).toContain("const title = 'My API';");
        expect(tempSource).toContain('export const burgerOptions = {');
        expect(tempSource).toContain('hostname');
        expect(tempSource).not.toContain('const app =');

        cleanupEntryOptionsModule(result.tempFilePath);
        expect(existsSync(result.tempFilePath!)).toBe(false);
    });

    it('strips trailing declaration with TypeScript type annotation (const app: Burger =)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        const entryPath = join(dir, 'index.ts');
        writeFileSync(
            entryPath,
            `
import { Burger } from 'burger-api';

const app: Burger = new Burger({
  title: 'Typed API',
  hostname: '0.0.0.0',
});

app.serve(4000);
`,
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeDefined();
        expect(result.tempFilePath).toBeDefined();
        expect(existsSync(result.tempFilePath!)).toBe(true);

        const tempSource = readFileSync(result.tempFilePath!, 'utf-8');
        expect(tempSource).toContain('export const burgerOptions = {');
        expect(tempSource).not.toContain('const app: Burger =');

        cleanupEntryOptionsModule(result.tempFilePath);
        expect(existsSync(result.tempFilePath!)).toBe(false);
    });

    it('strips trailing export default when entry is export default new Burger({...})', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        const entryPath = join(dir, 'index.ts');
        writeFileSync(
            entryPath,
            `
import { Burger } from 'burger-api';

export default new Burger({
  title: 'Default Export API',
  hostname: '0.0.0.0',
});
`,
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeDefined();
        expect(result.tempFilePath).toBeDefined();
        expect(existsSync(result.tempFilePath!)).toBe(true);

        const tempSource = readFileSync(result.tempFilePath!, 'utf-8');
        expect(tempSource).toContain('export const burgerOptions = {');
        expect(tempSource).toContain('Default Export API');
        expect(tempSource).toContain('0.0.0.0');
        expect(tempSource).not.toContain('export default');

        cleanupEntryOptionsModule(result.tempFilePath);
        expect(existsSync(result.tempFilePath!)).toBe(false);
    });

    it('returns empty result when no Burger constructor exists', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        writeFileSync(
            join(dir, 'index.ts'),
            'console.log("no burger app");\n',
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeUndefined();
        expect(result.tempFilePath).toBeUndefined();
    });

    it('returns empty result when Burger constructor receives a variable (no inline object)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        writeFileSync(
            join(dir, 'index.ts'),
            `
import { Burger } from 'burger-api';
const config = { title: 'API', hostname: '0.0.0.0' };
const app = new Burger(config);
app.serve(4000);
`,
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeUndefined();
        expect(result.tempFilePath).toBeUndefined();
    });

    it('does not use a later { (e.g. arrow function) as options when constructor has variable', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        writeFileSync(
            join(dir, 'index.ts'),
            `
import { Burger } from 'burger-api';
const app = new Burger(myConfigVariable);
app.serve(4000, () => { return 1; });
`,
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeUndefined();
        expect(result.tempFilePath).toBeUndefined();
    });

    it('extracts full options when title uses nested template literal', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        const entryPath = join(dir, 'index.ts');
        writeFileSync(
            entryPath,
            [
                "import { Burger } from 'burger-api';",
                '',
                'const app = new Burger({',
                '  title: `${`nested`} text`,',
                "  hostname: '0.0.0.0',",
                '});',
                '',
                'app.serve(4000);',
            ].join('\n'),
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeDefined();
        expect(result.tempFilePath).toBeDefined();
        expect(existsSync(result.tempFilePath!)).toBe(true);

        const tempSource = readFileSync(result.tempFilePath!, 'utf-8');
        try {
            expect(tempSource).toContain('export const burgerOptions = {');
            expect(tempSource).toContain("hostname: '0.0.0.0'");
            expect(tempSource).toContain('title: `${`nested`} text`,');
        } finally {
            cleanupEntryOptionsModule(result.tempFilePath);
        }
    });

    it('extracts full options when title uses deeply nested template literals', () => {
        const dir = mkdtempSync(join(tmpdir(), 'burger-cli-entry-options-'));
        tempDirs.push(dir);

        const entryPath = join(dir, 'index.ts');
        writeFileSync(
            entryPath,
            [
                "import { Burger } from 'burger-api';",
                '',
                'const app = new Burger({',
                '  title: `${`a${`b`}c`}`,',
                "  hostname: '0.0.0.0',",
                '});',
                '',
                'app.serve(4000);',
            ].join('\n'),
            'utf-8'
        );

        const result = prepareEntryOptionsModule({
            cwd: dir,
            entryFile: './index.ts',
        });

        expect(result.importPath).toBeDefined();
        expect(result.tempFilePath).toBeDefined();
        expect(existsSync(result.tempFilePath!)).toBe(true);

        const tempSource = readFileSync(result.tempFilePath!, 'utf-8');
        try {
            expect(tempSource).toContain('export const burgerOptions = {');
            expect(tempSource).toContain("hostname: '0.0.0.0'");
            expect(tempSource).toContain('title: `${`a${`b`}c`}`,');
        } finally {
            cleanupEntryOptionsModule(result.tempFilePath);
        }
    });
});

describe('findDroppedEntryCode', () => {
    it('returns nothing when there is no Burger constructor', () => {
        expect(findDroppedEntryCode('const x = 1;\n')).toEqual([]);
    });

    it('ignores the usual imports, constructor and serve tail', () => {
        const source = [
            "import { Burger } from 'burger-api';",
            '',
            "const app = new Burger({ title: 'API' });",
            '',
            'const port = Number(process.env.PORT) || 4000;',
            'app.serve(port, () => {',
            "    console.log('up');",
            '});',
            '',
        ].join('\n');
        expect(findDroppedEntryCode(source)).toEqual([]);
    });

    it('reports code after the constructor that the build would drop', () => {
        const source = [
            "const app = new Burger({ title: 'API' });",
            'const extra = setup();',
            'app.serve(4000);',
            'afterServe();',
            '',
        ].join('\n');
        expect(findDroppedEntryCode(source)).toEqual([
            'const extra = setup();',
            'afterServe();',
        ]);
    });

    it('strips comments and the export default tail', () => {
        const source = [
            "const app = new Burger({ title: 'API' });",
            '/* block',
            'comment */',
            'app.serve(4000);',
            'export default app;',
            '// trailing note',
            '',
        ].join('\n');
        expect(findDroppedEntryCode(source)).toEqual([]);
    });
});
