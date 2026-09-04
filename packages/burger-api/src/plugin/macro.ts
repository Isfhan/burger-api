import type { ResolvedPlugin, MacroFn } from './types.js';

/**
 * Registers named macros — plugin-scoped `GlobalHooks` bundles — and expands
 * all of them into `ResolvedPlugin`s (scope `'plugin'`) at app-build time.
 * Macros take no per-call arguments; a macro factory is a zero-arg bundle
 * of hooks, not a per-route configurable unit.
 */
export class MacroRegistry {
    private macros = new Map<string, MacroFn>();

    register(name: string, fn: MacroFn): boolean {
        if (this.macros.has(name)) return false;
        this.macros.set(name, fn);
        return true;
    }

    has(name: string): boolean {
        return this.macros.has(name);
    }

    expandAll(): ResolvedPlugin[] {
        const out: ResolvedPlugin[] = [];
        for (const [name, fn] of this.macros) {
            const hooks = fn();
            out.push({ name, hooks, scope: 'plugin' });
        }
        return out;
    }

    clear(): void {
        this.macros.clear();
    }

    size(): number {
        return this.macros.size;
    }
}
