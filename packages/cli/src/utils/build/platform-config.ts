/**
 * Scaffolds the platform config file `wrangler`/`deno`/`vercel` each expect
 * at the project root, only when one doesn't already exist there — a
 * `burger-api build --target=<platform>` run never overwrites a project's
 * own config.
 */

import { existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { RuntimeTarget } from '../../types/index';
import { getProjectName } from './project';
import { info } from '../logger';

function wranglerToml(projectName: string, mainPath: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return (
        `name = "${projectName}"\n` +
        `main = "${mainPath}"\n` +
        `compatibility_date = "${date}"\n` +
        `compatibility_flags = ["nodejs_compat"]\n`
    );
}

function denoJson(): string {
    return JSON.stringify(
        { imports: { 'burger-api': 'npm:burger-api' } },
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
              ? denoJson()
              : vercelJson();

    writeFileSync(configPath, content, 'utf-8');
    info(`Scaffolded ${configFile} (no existing config found).`);
}
