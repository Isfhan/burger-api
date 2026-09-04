import type { CompiledHandler } from './types.js';

/**
 * O(1) static dispatch table.
 *
 * Static API routes are served by Bun's native `routes` map (the fast path).
 * This structure holds the framework-side copy of those routes so the Router
 * can enumerate them into Bun's map and can also resolve loose-trailing-slash
 * variants that Bun did not match directly (via the `fetch` fallback).
 *
 * Keyed by path (the same key Bun uses). A single compiled handler serves all
 * methods for a path; method dispatch and 405+Allow happen inside the handler.
 */
export class StaticMap {
    private map = new Map<string, CompiledHandler>();

    /**
     * Registers a compiled handler for a static path.
     * @throws if a *different* handler is already registered at the same path
     * (duplicate static route). Re-setting the same handler reference
     * (used for loose trailing-slash variants) is allowed.
     */
    set(path: string, handler: CompiledHandler): void {
        const existing = this.map.get(path);
        if (existing !== undefined && existing !== handler) {
            throw new Error(`Duplicate static route registered: ${path}`);
        }
        this.map.set(path, handler);
    }

    get(path: string): CompiledHandler | undefined {
        return this.map.get(path);
    }

    has(path: string): boolean {
        return this.map.has(path);
    }

    /**
     * Yields `[path, handler]` pairs for feeding Bun's `routes` map.
     */
    entries(): IterableIterator<[string, CompiledHandler]> {
        return this.map.entries();
    }
}
