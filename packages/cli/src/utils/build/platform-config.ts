/**
 * Scaffolds the platform config file `wrangler`/`deno`/`vercel` each expect
 * at the project root, only when one doesn't already exist there — a
 * `burger-api build --target=<platform>` run never overwrites a project's
 * own config.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { RuntimeTarget } from '../../types/index';
import { getProjectName } from './project';
import { info } from '../logger';

/**
 * Fixed, known-good Workers compatibility date. Today's date is rejected by
 * any wrangler whose bundled runtime is older than today ("date in the
 * future"); bump deliberately after verifying against current wrangler.
 */
export const WRANGLER_COMPATIBILITY_DATE = '2025-06-01';

function wranglerToml(projectName: string, mainPath: string): string {
    const date = WRANGLER_COMPATIBILITY_DATE;
    return (
        `name = "${projectName}"\n` +
        `main = "${mainPath}"\n` +
        `compatibility_date = "${date}"\n` +
        `compatibility_flags = ["nodejs_compat"]\n`
    );
}

/**
 * The `burger-api` range from the project's package.json, when it is a
 * registry range (not link:/file:/workspace:). An unpinned `npm:burger-api`
 * resolves the latest stable release on Deno Deploy, not the version the
 * project was built and tested with.
 */
function projectBurgerApiRange(cwd: string): string | undefined {
    try {
        const pkg = JSON.parse(
            readFileSync(resolve(cwd, 'package.json'), 'utf-8')
        ) as { dependencies?: Record<string, string> };
        const range = pkg.dependencies?.['burger-api'];
        if (!range || /^(link|file|workspace|git|http)/.test(range)) {
            return undefined;
        }
        return range;
    } catch {
        return undefined;
    }
}

export function denoJson(cwd: string): string {
    const range = projectBurgerApiRange(cwd);
    return JSON.stringify(
        {
            imports: {
                'burger-api': range ? `npm:burger-api@${range}` : 'npm:burger-api',
            },
        },
        null,
        2
    ) + '\n';
}

function vercelJson(): string {
    return (
        JSON.stringify(
            { rewrites: [{ source: '/(.*)', destination: '/api' }] },
            null,
            2
        ) + '\n'
    );
}

/**
 * Writes the platform's config file at the project root when missing.
 * `outfile` (relative to `cwd`) becomes wrangler's `main` entry; Deno and
 * Vercel don't need the entry path in their config (Deno is pointed at it
 * directly on the command line; Vercel discovers `api/index.ts` by
 * convention — see `defaultOutfileForTarget`).
 */
export function scaffoldPlatformConfig(
    cwd: string,
    target: RuntimeTarget,
    outfile: string
): void {
    const configFile =
        target === 'cloudflare'
            ? 'wrangler.toml'
            : target === 'deno'
              ? 'deno.json'
              : target === 'vercel'
                ? 'vercel.json'
                : undefined;
    if (!configFile) return;

    const configPath = resolve(cwd, configFile);
    if (existsSync(configPath)) return;

    const content =
        target === 'cloudflare'
            ? wranglerToml(getProjectName(cwd), outfile.split('\\').join('/'))
            : target === 'deno'
              ? denoJson(cwd)
              : vercelJson();

    writeFileSync(configPath, content, 'utf-8');
    info(`Scaffolded ${configFile} (no existing config found).`);
}
