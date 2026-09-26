import type { CompiledHandler, NativeMethodCores } from './types.js';

/**
 * One static route's framework-side entry: the method-dispatching compiled
 * handler plus the per-method specialized cores (used by the `fetch` fallback
 * to dispatch a known method without re-entering the dispatching wrapper).
 */
export interface StaticEntry {
    handler: CompiledHandler;
    cores: NativeMethodCores | undefined;
}

/**
 * Static dispatch table.
 *
 * Static API routes are served by Bun's native `routes` map (the fast path);
 * this holds the framework-side copy so the Router can enumerate them into
 * Bun's map and resolve loose-trailing-slash variants Bun did not match.
 * Keyed by path; one compiled handler serves all methods, with dispatch and
 * 405+Allow inside it.
 */
export class StaticMap {
    private map = new Map<string, StaticEntry>();

    /**
     * Registers a compiled handler for a static path.
     * @throws if a *different* handler is already registered at the same path
     * (duplicate static route). Re-setting the same handler reference
     * (used for loose trailing-slash variants) is allowed.
     */
    set(
        path: string,
        handler: CompiledHandler,
        cores?: NativeMethodCores
    ): void {
        const existing = this.map.get(path);
        if (existing !== undefined && existing.handler !== handler) {
            throw new Error(`Duplicate static route registered: ${path}`);
        }
        this.map.set(path, { handler, cores });
    }

    get(path: string): CompiledHandler | undefined {
        return this.map.get(path)?.handler;
    }

    /** The full entry (handler + method cores) for a static path. */
    getEntry(path: string): StaticEntry | undefined {
        return this.map.get(path);
    }

    has(path: string): boolean {
        return this.map.has(path);
    }

    /**
     * Yields `[path, handler]` pairs for feeding Bun's `routes` map.
     */
    entries(): IterableIterator<[string, CompiledHandler]> {
        const out: [string, CompiledHandler][] = [];
        for (const [path, entry] of this.map) out.push([path, entry.handler]);
        return out[Symbol.iterator]();
    }
}
