import type { GlobalHooks } from '../lifecycle/types.js';
import type { Scope } from '../chain/node.js';

export interface Plugin {
    name: string;
    hooks?: GlobalHooks;
}

export type PluginFactory = () => Plugin | Promise<Plugin>;

export interface ResolvedPlugin {
    name: string;
    hooks: GlobalHooks;
    scope: Scope;
}

export interface PluginEntry {
    plugin: Plugin | PluginFactory;
    scope: Scope;
    seed?: string;
}

export type { Scope };

/**
 * A macro factory bundles a plugin-scoped `GlobalHooks` set under a name,
 * registered via `burger.macro(name, fn)` and expanded (as a plugin, scope
 * `'plugin'`) by `expandAll()`. Macros are plugin-scoped bundles, not a
 * per-route opt-in — there is no per-call-site argument passing today.
 */
export type MacroFn = () => GlobalHooks;
