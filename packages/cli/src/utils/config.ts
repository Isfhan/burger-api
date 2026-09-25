/**
 * Build config resolution: conventions-first with optional burger.build.ts
 *
 * Used by the CLI build pipeline to discover apiDir, pageDir, and prefixes
 * without parsing the user's entry file.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import type { BuildConfig, RuntimeTarget } from '../types/index';
import { warning } from './logger';
import { extractBurgerOptionsObjectLiteral } from './entry-options';

export const VALID_TARGETS: RuntimeTarget[] = [
    'bun',
    'node',
    'cloudflare',
    'deno',
    'vercel',
];

export const CONVENTION_DEFAULTS: BuildConfig = {
    apiDir: './src/api',
    pageDir: './src/pages',
    apiPrefix: '/api',
    pagePrefix: '/',
    wsDir: './src/websocket',
    debug: false,
    target: 'bun',
};

const CONFIG_NAMES = [
    'burger.build.ts',
    'burger.build.js',
    // legacy names (read-only fallback during migration)
    'burger.config.ts',
    'burger.config.js',
];

/**
 * Resolve build configuration from the project directory.
 * Uses convention defaults; overrides with burger.build.ts (or legacy burger.config.ts) if present.
 *
 * @param cwd - Project root (e.g. process.cwd())
 * @returns BuildConfig with resolved paths and prefixes
 */
export async function resolveBuildConfig(
    cwd: string,
    opts: { throwOnError?: boolean } = {}
): Promise<BuildConfig> {
    let configPath: string | null = null;
    for (const name of CONFIG_NAMES) {
        const candidate = join(cwd, name);
        if (existsSync(candidate)) {
            configPath = candidate;
            break;
        }
    }

    if (!configPath) {
        return { ...CONVENTION_DEFAULTS };
    }

    try {
        const configUrl = pathToFileURL(configPath).href;
        const mod = await import(configUrl);
        const user = mod.default ?? mod;
        if (!user || typeof user !== 'object') {
            return { ...CONVENTION_DEFAULTS };
        }
        return mergeBuildConfig(CONVENTION_DEFAULTS, user);
    } catch (err) {
        if (opts.throwOnError) throw err;
        warning(
            `Could not load ${configPath}: ${err instanceof Error ? err.message : String(err)}. Using convention defaults.`
        );
        return { ...CONVENTION_DEFAULTS };
    }
}

function mergeBuildConfig(
    defaults: BuildConfig,
    user: Record<string, unknown>
): BuildConfig {
    return {
        apiDir: typeof user.apiDir === 'string' ? user.apiDir : defaults.apiDir,
        pageDir:
            typeof user.pageDir === 'string' ? user.pageDir : defaults.pageDir,
        apiPrefix:
            typeof user.apiPrefix === 'string'
                ? user.apiPrefix
                : defaults.apiPrefix,
        pagePrefix:
            typeof user.pagePrefix === 'string'
                ? user.pagePrefix
                : defaults.pagePrefix,
        wsDir: typeof user.wsDir === 'string' ? user.wsDir : defaults.wsDir,
        debug: typeof user.debug === 'boolean' ? user.debug : defaults.debug,
        target:
            typeof user.target === 'string' &&
            VALID_TARGETS.includes(user.target as RuntimeTarget)
                ? (user.target as RuntimeTarget)
                : defaults.target,
    };
}

/** Scan/prefix options that must agree between src/index.* and burger.build.ts. */
export const SHARED_SCAN_KEYS = [
    'apiDir',
    'apiPrefix',
    'pageDir',
    'pagePrefix',
    'wsDir',
] as const;
export type SharedScanKey = (typeof SHARED_SCAN_KEYS)[number];

/**
 * Read the string-literal scan options from `new Burger({ ... })` in the
 * entry file. Keys whose value is not a plain string literal (variables,
 * env lookups) are reported in `dynamic` — they cannot be compared.
 * Returns undefined when the entry or its options object is not found.
 */
export function readEntryScanOptions(entryPath: string):
    | {
          values: Partial<Record<SharedScanKey, string>>;
          dynamic: SharedScanKey[];
      }
    | undefined {
    if (!existsSync(entryPath)) return undefined;
    const literal = extractBurgerOptionsObjectLiteral(
        readFileSync(entryPath, 'utf-8')
    );
    if (!literal) return undefined;
    const values: Partial<Record<SharedScanKey, string>> = {};
    const dynamic: SharedScanKey[] = [];
    for (const key of SHARED_SCAN_KEYS) {
        const present = new RegExp(`(?:^|[\\s,{])${key}\\s*:`).exec(literal);
        if (!present) continue;
        const m = new RegExp(
            `(?:^|[\\s,{])${key}\\s*:\\s*(['"\`])([^'"\`$]*)\\1\\s*[,}\\n]`
        ).exec(literal);
        if (m) values[key] = m[2] ?? '';
        else dynamic.push(key);
    }
    return { values, dynamic };
}

function normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '/';
}

/** Resolve a scan dir like the runtime does: project root first, then the entry's dir. */
function resolveDirLikeRuntime(cwd: string, appDir: string, dir: string): string {
    const fromCwd = resolve(cwd, dir);
    if (existsSync(fromCwd)) return fromCwd;
    const fromApp = resolve(appDir, dir);
    return existsSync(fromApp) ? fromApp : fromCwd;
}

/**
 * Compare the scan options `burger-api dev`/`start` will use (entry file,
 * falling back to the runtime defaults) with what build/inspect/doctor use
 * (burger.build.ts over {@link CONVENTION_DEFAULTS}). Returns one
 * human-readable message per detectable disagreement — empty when they
 * agree or when the entry options cannot be read statically.
 */
export function compareEntryAndBuildConfig(
    cwd: string,
    entryFile: string,
    config: BuildConfig
): string[] {
    const entryPath = resolve(cwd, entryFile);
    const entry = readEntryScanOptions(entryPath);
    if (!entry) return [];
    const appDir = dirname(entryPath);
    const messages: string[] = [];
    for (const key of SHARED_SCAN_KEYS) {
        if (entry.dynamic.includes(key)) continue;
        const entryValue = entry.values[key] ?? CONVENTION_DEFAULTS[key];
        const buildValue = config[key] ?? CONVENTION_DEFAULTS[key];
        if (entryValue === undefined || buildValue === undefined) continue;
        const same = key.endsWith('Prefix')
            ? normalizePrefix(entryValue) === normalizePrefix(buildValue)
            : resolveDirLikeRuntime(cwd, appDir, entryValue) ===
              resolveDirLikeRuntime(cwd, appDir, buildValue);
        if (same) continue;
        const entryShown =
            entry.values[key] !== undefined
                ? `"${entryValue}"`
                : `not set (runtime default "${entryValue}")`;
        messages.push(
            `${key}: ${entryFile} has ${entryShown} but burger.build has "${buildValue}" — ` +
                `dev/start and build would serve different routes. Use the same value in both files.`
        );
    }
    return messages;
}
