/**
 * Scaffold the platform config file (wrangler/deno/vercel) at the project
 * root when missing — never overwrite an existing config.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { RuntimeTarget } from '../../types/index';
import { getProjectName } from './project';
import { info } from '../logger';

/**
 * Fixed, known-good Workers compatibility date. Older wrangler runtimes
 * reject "today" as a future date; bump deliberately after verifying.
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
 * would resolve to the latest release, not the tested one.
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
 * Write the platform's config file when missing. `outfile` becomes
 * wrangler's `main`; Deno and Vercel discover the entry themselves.
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
