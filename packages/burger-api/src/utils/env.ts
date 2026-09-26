/**
 * `true` unless `NODE_ENV === 'production'` — the permissive debug default
 * used when no explicit option decided. Reading `process.env` throws on Deno
 * without `--allow-env`, and `process` may not exist on some runtimes (e.g.
 * Workers without `nodejs_compat`); both fall back to `true`.
 */
export function isNotProductionEnv(): boolean {
    if (typeof process === 'undefined') return true;
    try {
        return process.env.NODE_ENV !== 'production';
    } catch {
        return true;
    }
}
