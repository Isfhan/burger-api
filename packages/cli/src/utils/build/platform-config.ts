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

/**
 * Wrangler worker-name rules: lowercase letters, digits and dashes, at most
 * 63 characters, no leading/trailing dash. npm scopes are dropped and any
 * other invalid character becomes a dash, so `@scope/My_App` → `my-app`.
 */
export function wranglerWorkerName(projectName: string): string {
    const name = projectName
        .replace(/^@[^/]+\//, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63)
        .replace(/-+$/, '');
    return name || 'app';
}

function wranglerToml(projectName: string, mainPath: string): string {
    const date = WRANGLER_COMPATIBILITY_DATE;
    return (
        `name = "${wranglerWorkerName(projectName)}"\n` +
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
function projectBurgerApiSpec(cwd: string): string | undefined {
    try {
        const pkg = JSON.parse(
            readFileSync(resolve(cwd, 'package.json'), 'utf-8')
        ) as { dependencies?: Record<string, string> };
        return pkg.dependencies?.['burger-api'];
    } catch {
        return undefined;
    }
}

export function denoJson(cwd: string): string {
    const spec = projectBurgerApiSpec(cwd);
    // Route files import each other without extensions (`./schema`), which
    // Deno only allows with sloppy imports.
    const config: Record<string, unknown> = { unstable: ['sloppy-imports'] };
    if (spec && /^(link|file|workspace)/.test(spec)) {
        // A local copy is not on npm: use the project's node_modules.
        config.nodeModulesDir = 'manual';
    } else {
        const range = spec && !/^(git|http)/.test(spec) ? spec : undefined;
        const pin = range ? `npm:burger-api@${range}` : 'npm:burger-api';
        config.imports = {
            'burger-api': pin,
            // Subpath imports (`burger-api/adapter/bun`, ...) need their own
            // map entry; the bare specifier does not cover them.
            'burger-api/': `${pin}/`,
        };
    }
    return JSON.stringify(config, null, 2) + '\n';
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
