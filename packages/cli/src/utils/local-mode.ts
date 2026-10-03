/**
 * Local mode: use the burger-api checkout the CLI runs from instead of
 * npm/GitHub. Turned on with `--local` on a command, or with
 * `BURGER_API_LOCAL=1` / `BURGER_API_LOCAL=true` for a whole shell.
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { info } from './logger';

/** `--local` value for the running command; undefined means "env decides". */
let flagValue: boolean | undefined;
/** Guards the one-time `Local mode` line on a repeated in-process run. */
let announced = false;

/** Record the `--local` flag for this command (undefined when it was absent). */
export function setLocalMode(flag: boolean | undefined): void {
    flagValue = flag;
    announced = false;
}

/** True when `--local` was passed, or BURGER_API_LOCAL is 1/true. */
export function isLocalMode(
    flag: boolean | undefined = flagValue,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    if (flag !== undefined) return flag;
    const value = (env.BURGER_API_LOCAL ?? '').trim().toLowerCase();
    return value === '1' || value === 'true';
}

/** True when `dir` looks like the burger-api repo checkout. */
function isRepoRoot(dir: string): boolean {
    return (
        existsSync(join(dir, 'packages', 'burger-api', 'package.json')) &&
        existsSync(join(dir, 'packages', 'cli', 'package.json')) &&
        existsSync(join(dir, 'ecosystem'))
    );
}

/**
 * Repo root of the running CLI: walk up from `startDir` (defaults to this
 * module's dir, i.e. `<repo>/packages/cli/src/utils`). BURGER_API_LOCAL_ROOT
 * exists only so tests can point at a fake checkout.
 *
 * @returns The repo root, or undefined when not running from a checkout
 */
export function localRepoRoot(startDir?: string): string | undefined {
    let dir = resolve(
        startDir ?? process.env.BURGER_API_LOCAL_ROOT ?? import.meta.dir
    );
    for (let i = 0; i < 12; i++) {
        if (isRepoRoot(dir)) return dir;
        const parent = dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
    return undefined;
}

/**
 * Repo root for local mode; throws a clear setup error when the CLI did not
 * run from a checkout (installed from npm, compiled binary, ...).
 */
export function requireLocalRepo(startDir?: string): string {
    const root = localRepoRoot(startDir);
    if (!root) {
        throw new Error(
            'Local mode is on, but this CLI is not running from a burger-api ' +
                'checkout. Clone the repo and run `bun link` in ' +
                'packages/burger-api and packages/cli.'
        );
    }
    return root;
}

/** Print `[i] Local mode: <root>` once per command. */
export function announceLocalMode(): void {
    if (!isLocalMode() || announced) return;
    announced = true;
    info(`Local mode: ${requireLocalRepo()}`);
}

/**
 * Directory where bun keeps global `bun link` registrations
 * (`$BUN_INSTALL/install/global/node_modules`).
 */
export function bunLinkStore(env: NodeJS.ProcessEnv = process.env): string {
    const bunInstall = env.BUN_INSTALL ?? join(homedir(), '.bun');
    return join(bunInstall, 'install', 'global', 'node_modules');
}

/**
 * Throw unless both packages are registered with `bun link`. The scaffolded
 * package.json uses `link:` specifiers, so `bun install` needs them.
 *
 * @param root - Repo root (for the exact commands to print)
 * @param store - Link store dir (injectable for tests)
 */
export function requireLinkedPackages(root: string, store?: string): void {
    const linkStore = store ?? bunLinkStore();
    const names = ['burger-api', '@burger-api/cli'];
    const missing = names.filter(
        (name) => !existsSync(join(linkStore, ...name.split('/')))
    );
    if (missing.length === 0) return;

    const commands = missing
        .map((name) => {
            const dir = join(
                root,
                'packages',
                name === 'burger-api' ? 'burger-api' : 'cli'
            );
            return `  cd ${dir} && bun link`;
        })
        .join('\n');
    throw new Error(
        `Local mode scaffolds link: dependencies, but ${missing.join(' and ')} ` +
            `${missing.length > 1 ? 'are' : 'is'} not registered with bun link. Run:\n${commands}`
    );
}
