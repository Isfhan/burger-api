/**
 * Short-lived local cache for GitHub-sourced ecosystem catalogs
 * (`getComponentList()`, `getSkillList()`). Both are live GitHub Contents
 * API listings that change rarely — hitting the network on every single
 * `add`/`list`/`available`/`skills available` invocation is slow and
 * silently breaks the command offline, for information that's usually
 * still correct hours later.
 *
 * A plain TTL-file cache, not a database: one JSON file per cached list
 * under `~/.burger-api/cache/`, an envelope of `{ fetchedAt, data }`, and
 * three states on read — fresh (serve from disk, no network), stale (try
 * a live refresh; on failure, fall back to the stale data rather than
 * failing the command), and missing (must fetch live; a failure here
 * still throws — a cold cache with no network genuinely has nothing to
 * show, and this module must never invent a silent empty result the way
 * `github.ts`'s own comments already warn against for the live path).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** Overridable for tests/sandboxes — never write into a real home dir there. */
function cacheDir(): string {
    return (
        process.env.BURGER_API_CACHE_DIR ?? join(homedir(), '.burger-api', 'cache')
    );
}

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEnvelope<T> {
    fetchedAt: number;
    data: T;
}

function cacheFilePath(key: string): string {
    return join(cacheDir(), `${key}.json`);
}

function readCacheFile<T>(key: string): CacheEnvelope<T> | null {
    const path = cacheFilePath(key);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as CacheEnvelope<T>;
    } catch {
        // Corrupt cache file — treat as absent rather than crashing.
        return null;
    }
}

function writeCacheFile<T>(key: string, data: T): void {
    try {
        mkdirSync(cacheDir(), { recursive: true });
        const envelope: CacheEnvelope<T> = { fetchedAt: Date.now(), data };
        writeFileSync(cacheFilePath(key), JSON.stringify(envelope));
    } catch {
        // Cache writes are best-effort — a read-only home dir or full disk
        // should never fail the command that triggered the fetch.
    }
}

/**
 * Returns cached data for `key` if it exists and is within `ttlMs`;
 * otherwise calls `fetchFresh()`, caches a successful result, and returns
 * it. If `fetchFresh()` throws and a cache entry exists (even expired),
 * returns the stale entry instead of failing — the caller is told via
 * the returned `stale` flag so it can warn, but a flaky network shouldn't
 * turn "slightly old ecosystem list" into "command doesn't work." A cold
 * cache with a failing fetch still throws — there is genuinely nothing
 * to serve.
 */
export async function withEcosystemCache<T>(
    key: string,
    fetchFresh: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS
): Promise<{ data: T; stale: boolean }> {
    const cached = readCacheFile<T>(key);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
        return { data: cached.data, stale: false };
    }

    try {
        const data = await fetchFresh();
        writeCacheFile(key, data);
        return { data, stale: false };
    } catch (err) {
        if (cached) {
            return { data: cached.data, stale: true };
        }
        throw err;
    }
}
