/**
 * Shared E2E helpers: temp project scaffolding with the local burger-api
 * package linked in, command running, and cleanup.
 */
import { expect } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createProject } from '../../src/utils/templates';
import type { CreateOptions } from '../../src/types';
import { baseCreateOptions, removeDir } from '../test-utils';

// Local framework package path, used as a `file:` dependency (see
// `scaffoldProject` for why not `link:`).
export const LOCAL_BURGER_API_PATH = resolve(
    import.meta.dir,
    '../../../burger-api'
);

export interface CmdResult {
    code: number;
    out: string;
    err: string;
}

const createdDirs: string[] = [];

/** Removes every directory created by {@link makeProjectDir}. */
export function cleanupProjects(): void {
    for (const dir of createdDirs) removeDir(dir);
    createdDirs.length = 0;
}

/**
 * Empty temp project dir, registered for cleanup by {@link cleanupProjects}.
 */
export async function makeProjectDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    createdDirs.push(dir);
    return dir;
}

/** Runs a command in `cwd` and captures its output. */
export async function run(cmd: string[], cwd: string): Promise<CmdResult> {
    const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const [code, out, err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { code, out, err };
}

/**
 * Scaffolds a project, installs the local burger-api package as a `file:`
 * dependency, and runs `bun install`.
 *
 * `file:` not `link:`: linking would form a symlink cycle with
 * `packages/burger-api/examples/*` (all linked to the same target) and
 * crash `tsc` project discovery with an OOM.
 */
export async function scaffoldProject(
    name: string,
    overrides: Partial<CreateOptions> = {}
): Promise<string> {
    const dir = await makeProjectDir(`burger-e2e-${name}-`);
    await createProject(dir, baseCreateOptions({ name, ...overrides }));

    const pkgPath = join(dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkg.dependencies['burger-api'] = `file:${LOCAL_BURGER_API_PATH}`;
    // The CLI under test runs from source; the (unpublished) @burger-api/cli
    // devDependency would make `bun install` fail offline.
    delete pkg.devDependencies?.['@burger-api/cli'];
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    const install = await run(['bun', 'install'], dir);
    expect(install.code).toBe(0);

    return dir;
}
