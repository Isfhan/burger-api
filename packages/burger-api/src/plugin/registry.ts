import type {
    Plugin,
    PluginFactory,
    ResolvedPlugin,
    PluginEntry,
} from './types.js';
import type { Scope } from '../chain/node.js';
import type { GlobalHooks } from '../lifecycle/types.js';

/**
 * Holds registered plugins and resolves them (factories are called once).
 *
 * Identity is the plugin's resolved `name` (+ optional `seed`). A plugin
 * object is keyed immediately; a factory is keyed only after it resolves —
 * keying a factory by its function name would collapse every anonymous
 * arrow factory (`name === ''`) into one. Every deduplicated registration
 * is reported with a warning instead of being dropped silently.
 */
export class PluginRegistry {
    private entries = new Map<string, PluginEntry>();
    private resolved = new Map<string, ResolvedPlugin>();
    /** Unique key counter for not-yet-resolved factory entries. */
    private factoryCount = 0;

    private key(name: string, seed?: string): string {
        return seed !== undefined ? `${name}\u0000${seed}` : name;
    }

    register(
        plugin: Plugin | PluginFactory,
        scope: Scope = 'plugin',
        seed?: string
    ): boolean {
        if (typeof plugin === 'function') {
            // The same factory function registered twice (same seed) is the
            // same plugin; different factories dedupe after resolution.
            for (const entry of this.entries.values()) {
                if (entry.plugin === plugin && entry.seed === seed) {
                    warnDuplicate(
                        plugin.name || '(anonymous factory)',
                        seed
                    );
                    return false;
                }
            }
            this.entries.set(`\u0001factory${this.factoryCount++}`, {
                plugin,
                scope,
                seed,
            });
            return true;
        }
        const k = this.key(plugin.name, seed);
        if (this.entries.has(k)) {
            warnDuplicate(plugin.name, seed);
            return false;
        }
        this.entries.set(k, { plugin, scope, seed });
        // Invalidate cached resolution
        this.resolved.delete(k);
        return true;
    }

    has(name: string, seed?: string): boolean {
        const k = this.key(name, seed);
        if (this.entries.has(k)) return true;
        for (const r of this.resolved.values()) {
            if (this.key(r.name, r.seed) === k) return true;
        }
        return false;
    }

    async resolve(
        name: string,
        seed?: string
    ): Promise<ResolvedPlugin | undefined> {
        const all = await this.resolveAll();
        return all.find((p) => p.name === name && p.seed === seed);
    }

    /** Resolves one entry (calling its factory at most once). */
    private async resolveEntry(
        entryKey: string,
        entry: PluginEntry
    ): Promise<ResolvedPlugin> {
        const cached = this.resolved.get(entryKey);
        if (cached) return cached;
        const raw =
            typeof entry.plugin === 'function'
                ? await (entry.plugin as () => Plugin | Promise<Plugin>)()
                : entry.plugin;

        const hooks: GlobalHooks = raw.hooks ?? {};
        const resolved: ResolvedPlugin = {
            name: raw.name,
            hooks,
            scope: entry.scope,
            seed: entry.seed,
        };
        this.resolved.set(entryKey, resolved);
        return resolved;
    }

    async resolveAll(): Promise<ResolvedPlugin[]> {
        const out: ResolvedPlugin[] = [];
        const seen = new Set<string>();
        for (const [entryKey, entry] of this.entries) {
            const resolved = await this.resolveEntry(entryKey, entry);
            const identity = this.key(resolved.name, resolved.seed);
            if (seen.has(identity)) {
                // Warn once per duplicate entry, then forget it so later
                // resolveAll() calls stay quiet.
                warnDuplicate(resolved.name, resolved.seed);
                this.entries.delete(entryKey);
                this.resolved.delete(entryKey);
                continue;
            }
            seen.add(identity);
            out.push(resolved);
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

function warnDuplicate(name: string, seed?: string): void {
    console.warn(
        `[burger-api] Plugin "${name}"${seed !== undefined ? ` (seed "${seed}")` : ''} ` +
            'is already registered — this registration is ignored. Pass a ' +
            'distinct seed (usePlugin(plugin, scope, seed)) to register it twice.'
    );
}
