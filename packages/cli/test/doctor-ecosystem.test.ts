/**
 * doctor — copied official hooks and plugins. An auth plugin copied before
 * the "authenticate before validation" fix (B2) fails doctor with the exact
 * fix; an older copy is a warning; your own add-ons are skipped.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ecosystemChecks } from '../src/commands/doctor';
import { ECOSYSTEM_VERSIONS } from '../src/utils/ecosystem-versions';
import { makeTempDir, removeDir, runCli } from './test-utils';

const REPO = join(import.meta.dir, '..', '..', '..');
const BETA1 = join(import.meta.dir, 'fixtures', 'ecosystem-beta1', 'jwt-auth');
const CURRENT = join(REPO, 'ecosystem', 'plugins', 'jwt-auth');

const beta1Source = () => readFile(join(BETA1, 'jwt-auth.ts.txt'), 'utf-8');
const beta1Pkg = () => readFile(join(BETA1, 'package.json.txt'), 'utf-8');
const currentSource = () => readFile(join(CURRENT, 'jwt-auth.ts'), 'utf-8');
const currentPkg = () => readFile(join(CURRENT, 'package.json'), 'utf-8');

let tmpDir = '';
let caseNo = 0;

beforeEach(() => {
    tmpDir = makeTempDir('burger-doctor-ecosystem-');
});

afterEach(() => {
    removeDir(tmpDir);
});

/** A project folder containing only `files` (doctor reads ecosystem/). */
async function makeProject(files: Record<string, string>): Promise<string> {
    const dir = join(tmpDir, `case-${++caseNo}`);
    for (const [rel, content] of Object.entries(files)) {
        const file = join(dir, rel);
        await mkdir(join(file, '..'), { recursive: true });
        await writeFile(file, content);
    }
    return dir;
}

const JWT = 'ecosystem/plugins/jwt-auth';

describe('doctor ecosystem checks', () => {
    it('fails on a beta.1 jwt-auth copy and names the fix', async () => {
        const dir = await makeProject({
            [`${JWT}/jwt-auth.ts`]: await beta1Source(),
            [`${JWT}/package.json`]: await beta1Pkg(),
        });
        const [result] = ecosystemChecks(dir);
        expect(result).toMatchObject({ name: JWT, pass: false });
        expect(result!.message).toContain('Security issue');
        expect(result!.message).toContain('burger-api add jwt-auth --force');
    });

    it('fails on an edited beta.1 copy with no package.json', async () => {
        const dir = await makeProject({
            [`${JWT}/jwt-auth.ts`]:
                '// my tweaks\n' +
                (await beta1Source()).replace('Missing', 'No'),
        });
        expect(ecosystemChecks(dir)[0]).toMatchObject({ pass: false });
    });

    it('passes a current copy', async () => {
        const dir = await makeProject({
            [`${JWT}/jwt-auth.ts`]: await currentSource(),
            [`${JWT}/package.json`]: await currentPkg(),
        });
        expect(ecosystemChecks(dir)).toEqual([
            {
                name: JWT,
                pass: true,
                message: `Up to date (${ECOSYSTEM_VERSIONS['jwt-auth']})`,
            },
        ]);
    });

    it('passes a current copy the user edited', async () => {
        const dir = await makeProject({
            [`${JWT}/jwt-auth.ts`]:
                (await currentSource()) +
                '\nexport const audit = (msg: string) => console.log(msg);\n',
            [`${JWT}/package.json`]: await currentPkg(),
        });
        expect(ecosystemChecks(dir)[0]).toMatchObject({ pass: true });
        expect(ecosystemChecks(dir)[0]!.severity).toBeUndefined();
    });

    it('warns (not fails) on fixed code that still has the old 0.1.0 marker', async () => {
        const dir = await makeProject({
            [`${JWT}/jwt-auth.ts`]: await currentSource(),
            [`${JWT}/package.json`]: await beta1Pkg(),
        });
        const [result] = ecosystemChecks(dir);
        expect(result).toMatchObject({ pass: true, severity: 'warning' });
        expect(result!.message).toContain('older than');
    });

    it('warns on a hook copied before markers existed', async () => {
        const dir = await makeProject({
            'ecosystem/hooks/cors/cors.ts': 'export const cors = () => {};',
        });
        const [result] = ecosystemChecks(dir);
        expect(result).toMatchObject({
            name: 'ecosystem/hooks/cors',
            pass: true,
            severity: 'warning',
        });
        expect(result!.message).toContain('burger-api add cors --force');
    });

    it('skips add-ons it does not know', async () => {
        const dir = await makeProject({
            'ecosystem/plugins/audit-log/audit-log.ts':
                'export const beforeRoute = 1;',
        });
        expect(ecosystemChecks(dir)).toEqual([]);
    });

    it('doctor --json reports the failure and exits 1', async () => {
        const dir = await makeProject({
            'package.json': JSON.stringify({
                name: 'app',
                dependencies: { 'burger-api': '^1.0.0-beta' },
            }),
            [`${JWT}/jwt-auth.ts`]: await beta1Source(),
            [`${JWT}/package.json`]: await beta1Pkg(),
        });
        const result = await runCli(['doctor', '--json'], { cwd: dir });
        expect(result.exitCode).toBe(1);
        const json = JSON.parse(result.stdout) as {
            ok: boolean;
            checks: { name: string; pass: boolean; message: string }[];
        };
        expect(json.ok).toBe(false);
        expect(json.checks.find((c) => c.name === JWT)).toMatchObject({
            pass: false,
        });
    });
});

describe('ecosystem version table', () => {
    it('matches every ecosystem package.json', () => {
        const found: Record<string, string> = {};
        for (const kind of ['hooks', 'plugins']) {
            const root = join(REPO, 'ecosystem', kind);
            for (const name of readdirSync(root)) {
                const pkg = join(root, name, 'package.json');
                if (!existsSync(join(root, name, `${name}.ts`))) continue;
                expect(existsSync(pkg)).toBe(true);
                found[name] = JSON.parse(readFileSync(pkg, 'utf-8')).version;
            }
        }
        expect(found).toEqual(ECOSYSTEM_VERSIONS);
    });

    it('current auth plugins have no beforeRoute hook', () => {
        for (const name of ['api-key', 'basic-auth', 'jwt-auth', 'oidc', 'session']) {
            const src = readFileSync(
                join(REPO, 'ecosystem', 'plugins', name, `${name}.ts`),
                'utf-8'
            );
            expect(src).not.toMatch(/\bbeforeRoute\s*:/);
        }
    });
});
