import type { Plugin, ResolvedPlugin, PluginEntry } from './types';
import type { Scope } from '../chain/node';
import type { RouteHooks } from '../lifecycle/types';

export class PluginRegistry {
    private entries = new Map<string, PluginEntry>();
    private resolved = new Map<string, ResolvedPlugin>();

    private key(name: string, seed?: string): string {
        return seed !== undefined ? `${name}\u0000${seed}` : name;
    }

    register(plugin: Plugin, scope: Scope = 'plugin', seed?: string): boolean {
        const k = this.key(plugin.name, seed);
        if (this.entries.has(k)) return false;
        this.entries.set(k, { plugin, scope, seed });
        // Invalidate cached resolution
        this.resolved.delete(k);
        return true;
    }

    has(name: string, seed?: string): boolean {
        return this.entries.has(this.key(name, seed));
    }

    async resolve(name: string, seed?: string): Promise<ResolvedPlugin | undefined> {
        const k = this.key(name, seed);
        const cached = this.resolved.get(k);
        if (cached) return cached;

        const entry = this.entries.get(k);
        if (!entry) return undefined;

        const raw = typeof entry.plugin === 'function'
            ? await (entry.plugin as () => Plugin | Promise<Plugin>)()
            : entry.plugin;

        const hooks: RouteHooks = raw.hooks ?? {};
        const resolved: ResolvedPlugin = {
            name: raw.name,
            hooks,
            scope: entry.scope,
        };
        this.resolved.set(k, resolved);
        return resolved;
    }

    async resolveAll(): Promise<ResolvedPlugin[]> {
        const out: ResolvedPlugin[] = [];
        for (const [k] of this.entries) {
            const parts = k.split('\u0000');
            const name = parts[0];
            const seed = parts[1];
            const resolved = await this.resolve(name, seed);
            if (resolved) out.push(resolved);
        }
        return out;
    }

    clear(): void {
        this.entries.clear();
        this.resolved.clear();
    }

    size(): number {
        return this.entries.size;
    }
}
