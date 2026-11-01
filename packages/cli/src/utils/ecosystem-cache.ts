/**
 * Short-lived local cache for GitHub-sourced ecosystem catalogs
 * (`getComponentList()`, `getSkillList()`), so `add`/`list`/`skills
 * available` don't hit the network on every run and still work offline.
 *
 * One JSON file per list under `~/.burger-api/cache/`, holding
 * `{ fetchedAt, data }`; read policy is in {@link withEcosystemCache}.
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

/**
 * Cache key for a GitHub-sourced list, scoped to the repo and branch it came
 * from so a beta CLI, a stable CLI, and BURGER_API_BRANCH overrides never
 * share entries. Branch names may contain `/` (encoded here), which must not
 * leak into the cache filename.
 */
export function ecosystemCacheKey(
    name: string,
    source: { owner: string; repo: string; branch: string }
): string {
    return [
        name,
        encodeURIComponent(source.owner),
        encodeURIComponent(source.repo),
        encodeURIComponent(source.branch),
    ].join('-');
}

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
        // Best-effort: a read-only home dir or full disk must not fail the command.
    }
}

/**
 * Return cached data for `key` when within `ttlMs`; otherwise call
 * `fetchFresh()`, cache success, and return it. On fetch failure, fall back
 * to any cache entry (even expired) with `stale: true`; a cold cache with a
 * failing fetch throws.
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
