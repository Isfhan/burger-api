import { existsSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

/**
 * Resolves a scan root (apiDir / pageDir / wsDir) for the dev pipeline.
 *
 * Absolute paths are used as-is; existing paths relative to the project root
 * win; otherwise `BURGER_API_APP_DIR` (set by `burger-api dev` to the entry
 * file's directory, e.g. `<root>/src`) is tried, so `apiDir: 'api'` resolves
 * to `src/api`. Throws with the candidate paths when none exist.
 *
 * @param dir - The configured directory path
 * @param label - Kind of directory, e.g. 'Routes', 'Pages', 'WebSocket'
 * @param option - The option name, e.g. 'apiDir'
 * @returns The resolved directory path
 * @throws Error listing the tried candidates when the directory is not found
 */
export function resolveScanDir(dir: string, label: string, option: string): string {
    if (isAbsolute(dir)) {
        if (existsSync(dir)) return dir;
        throw new Error(
            `${label} directory "${dir}" does not exist. ` +
                `Check the ${option} option in src/index.ts.`
        );
    }
    if (existsSync(dir)) return dir;

    const appDir = process.env.BURGER_API_APP_DIR;
    const srcCandidate = appDir ? join(appDir, dir) : undefined;
    if (srcCandidate && existsSync(srcCandidate)) return srcCandidate;

    const tried = [`"./${dir.replace(/^\.\//, '')}" (project root)`];
    if (srcCandidate) {
        const shown = relative(process.cwd(), srcCandidate).replaceAll('\\', '/');
        tried.push(`"./${shown}" (src/)`);
    } else {
        tried.push(`"./src/${dir.replace(/^\.\//, '')}" (src/)`);
    }
    const message =
        `${label} directory "${dir}" does not exist. Tried ${tried.join(' and ')}. ` +
        `Check the ${option} option in src/index.ts.`;
    throw new Error(
        appDir
            ? message
            : message + ` Run via "burger-api dev" to enable the src/ fallback.`
    );
}

/**
 * Convention default for a scan root the app did not configure
 * (`src/api`, `src/pages`, `src/websocket`) — matches the CLI build's
 * defaults so dev and production mount the same directories. Returns the
 * path only when it exists: `./src/<name>`, else `<BURGER_API_APP_DIR>/<name>`.
 */
export function resolveConventionDir(
    name: 'api' | 'pages' | 'websocket'
): string | undefined {
    const rel = `./src/${name}`;
    if (existsSync(rel)) return rel;
    const appDir = process.env.BURGER_API_APP_DIR;
    if (appDir) {
        const candidate = join(appDir, name);
        if (existsSync(candidate)) return candidate;
    }
    return undefined;
}
