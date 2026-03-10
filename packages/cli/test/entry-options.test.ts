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
import { globalMiddleware } from './middleware';

const title = 'My API';

const app = new Burger({
  title,
  description: 'desc',
  version: '1.2.3',
  hostname: '0.0.0.0',
  globalMiddleware,
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
            "import { globalMiddleware } from './middleware';"
        );
        expect(tempSource).toContain("const title = 'My API';");
        expect(tempSource).toContain('export const burgerOptions = {');
        expect(tempSource).toContain('globalMiddleware');
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
});
