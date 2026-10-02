/**
 * `true` only when `NODE_ENV === 'development'` — debug output (stack, cause,
 * response-validation detail) is opt-in. Reading `process.env` throws on Deno
 * without `--allow-env`, and `process` may not exist on some runtimes (e.g.
 * Workers without `nodejs_compat`); both fall back to `false`.
 */
export function isDevelopmentEnv(): boolean {
    if (typeof process === 'undefined') return false;
    try {
        return process.env.NODE_ENV === 'development';
    } catch {
        return false;
    }
}

/**
 * Resolves the effective debug flag: an explicit option wins, otherwise
 * `NODE_ENV === 'development'`. Every debug consumer (router errors, hook
 * plans, the Bun adapter) must go through this so all error paths agree.
 */
export function resolveDebug(explicit?: boolean): boolean {
    return explicit ?? isDevelopmentEnv();
}
