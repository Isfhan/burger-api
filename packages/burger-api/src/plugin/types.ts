import type { RouteHooks } from '../lifecycle/types';
import type { Scope } from '../chain/node';

export interface Plugin {
    name: string;
    hooks?: RouteHooks;
}

export type PluginFactory = () => Plugin | Promise<Plugin>;

export interface ResolvedPlugin {
    name: string;
    hooks: RouteHooks;
    scope: Scope;
}

export interface PluginEntry {
    plugin: Plugin | PluginFactory;
    scope: Scope;
    seed?: string;
}

export type { Scope };

export type MacroFn = (...args: unknown[]) => RouteHooks;
