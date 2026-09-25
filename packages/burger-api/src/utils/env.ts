/**
 * `true` unless `process.env.NODE_ENV === 'production'` — the permissive
 * debug-mode default used wherever nothing else (an explicit option) has
 * already decided. Reading `process.env` throws on Deno without
 * `--allow-env` (a `NotCapable` permission error at first access, not just
 * `undefined`), and `process` doesn't exist at all on some WinterCG
 * runtimes (Cloudflare Workers without the `nodejs_compat` flag) — both
 * cases fall back to the same permissive default rather than crashing the
 * request.
 */
export function isNotProductionEnv(): boolean {
    if (typeof process === 'undefined') return true;
    try {
        return process.env.NODE_ENV !== 'production';
    } catch {
        return true;
    }
}
