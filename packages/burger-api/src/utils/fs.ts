import { existsSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

/**
 * Resolve a scan root directory (apiDir / pageDir / wsDir) for the dev
 * pipeline, with an entry-relative fallback:
 *
 * 1. Absolute paths are used as-is (still checked to exist).
 * 2. Paths that exist relative to the project root (process.cwd()) are used
 *    as-is — backward compatible, always wins over the fallback.
 * 3. Otherwise, if `BURGER_API_APP_DIR` is set (the CLI `dev` command sets it
 *    to the entry file's directory, e.g. `<root>/src`) and the path exists
 *    under it, that is used — so `apiDir: 'api'` resolves to `src/api` when
 *    `index.ts` lives in `src/`.
 * 4. Otherwise a dynamic error is thrown with the candidate paths, so the
 *    hint matches whatever the user named the directory.
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
