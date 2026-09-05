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
