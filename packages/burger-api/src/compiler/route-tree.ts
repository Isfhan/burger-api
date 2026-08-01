import type { RouteModule } from './route-module';

/**
 * A lightweight structural view of the compiled route set, used for
 * introspection and deterministic ordering. It performs NO dispatch logic
 * (that belongs to the router's `StaticMap`/`Trie`); it only organizes
 * `RouteModule`s by their path so downstream compilation and tooling can walk the
 * application shape predictably.
 *
 * Built once after the Module Loader produces the `RouteModule[]`; frozen for
 * the lifetime of the server (`ROADMAP.md` §4.3 — no per-request allocation).
 */
export class RouteTree {
    private byPath = new Map<string, RouteModule>();

    constructor(modules: RouteModule[]) {
        for (const mod of modules) {
            this.byPath.set(mod.path, mod);
        }
    }

    /** All route modules, sorted by path for deterministic iteration. */
    list(): RouteModule[] {
        return [...this.byPath.values()].sort((a, b) =>
            a.path.localeCompare(b.path)
        );
    }

    /** Looks up a single route module by its resolved path. */
    get(path: string): RouteModule | undefined {
        return this.byPath.get(path);
    }

    /** The number of routes in the tree. */
    get size(): number {
        return this.byPath.size;
    }
}
