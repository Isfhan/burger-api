import type { RouteHooks } from '../lifecycle/types';
import type { ResolvedPlugin, MacroFn } from './types';

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

    expand(name: string, ...args: unknown[]): RouteHooks | undefined {
        const fn = this.macros.get(name);
        if (!fn) return undefined;
        return fn(...args) as RouteHooks;
    }

    expandAll(): ResolvedPlugin[] {
        const out: ResolvedPlugin[] = [];
        for (const [name, fn] of this.macros) {
            const hooks = fn() as RouteHooks;
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
