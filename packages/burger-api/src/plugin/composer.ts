import type { Hook, ErrorHook, GlobalHooks } from '../lifecycle/types.js';
import { HookChain } from '../chain/chain.js';
import type { ResolvedPlugin } from './types.js';

export function composePluginHooks(
    chain: HookChain,
    plugins: ResolvedPlugin[],
    _routePath: string
): void {
    for (const plugin of plugins) {
        const hooks: GlobalHooks = plugin.hooks;
        const scope = plugin.scope;

        if (hooks.beforeRoute) {
            chain.addStage(
                'beforeRoute',
                toHookArray(hooks.beforeRoute),
                scope,
                plugin.name
            );
        }
        if (hooks.afterRoute) {
            chain.addStage(
                'afterRoute',
                toHookArray(hooks.afterRoute),
                scope,
                plugin.name
            );
        }
        if (hooks.mapResponse) {
            chain.addStage(
                'mapResponse',
                toHookArray(hooks.mapResponse),
                scope,
                plugin.name
            );
        }
        if (hooks.onError) {
            chain.addStage(
                'onError',
                toHookArray(hooks.onError),
                scope,
                plugin.name
            );
        }
        if (hooks.transform) {
            // Plugin transform keys are accumulated at the plan level, not as chain
            // nodes. The caller must merge transform records after flattening.
        }
    }
}

function toHookArray<T>(h: T | T[] | undefined): T[] {
    if (h === undefined) return [];
    return Array.isArray(h) ? h : [h];
}
