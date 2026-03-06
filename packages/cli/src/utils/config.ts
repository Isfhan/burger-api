/**
 * Build config resolution: conventions-first with optional burger.config.ts
 *
 * Used by the CLI build pipeline to discover apiDir, pageDir, and prefixes
 * without parsing the user's entry file.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { BuildConfig } from '../types/index';

const CONVENTION_DEFAULTS: BuildConfig = {
    apiDir: './src/api',
    pageDir: './src/pages',
    apiPrefix: '/api',
    pagePrefix: '/',
    debug: false,
};

const CONFIG_NAMES = ['burger.config.ts', 'burger.config.js'];

/**
 * Resolve build configuration from the project directory.
 * Uses convention defaults; overrides with burger.config.ts / burger.config.js if present.
 *
 * @param cwd - Project root (e.g. process.cwd())
 * @returns BuildConfig with resolved paths and prefixes
 */
export async function resolveBuildConfig(cwd: string): Promise<BuildConfig> {
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
        const mod = await import(configPath);
        const user = mod.default ?? mod;
        if (!user || typeof user !== 'object') {
            return { ...CONVENTION_DEFAULTS };
        }
        return mergeBuildConfig(CONVENTION_DEFAULTS, user);
    } catch (err) {
        console.warn(
            `[burger-api] Could not load ${configPath}: ${err instanceof Error ? err.message : String(err)}. Using convention defaults.`
        );
        return { ...CONVENTION_DEFAULTS };
    }
}

function mergeBuildConfig(
    defaults: BuildConfig,
    user: Record<string, unknown>
): BuildConfig {
    return {
        apiDir:
            typeof user.apiDir === 'string' ? user.apiDir : defaults.apiDir,
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
        debug:
            typeof user.debug === 'boolean' ? user.debug : defaults.debug,
    };
}
