import type { Hook, ErrorHook, RouteHooks } from '../lifecycle/types';
import { HookChain } from '../chain/chain';
import type { ResolvedPlugin } from './types';

export function composePluginHooks(
    chain: HookChain,
    plugins: ResolvedPlugin[],
    _routePath: string
): void {
    for (const plugin of plugins) {
        const hooks: RouteHooks = plugin.hooks;
        const scope = plugin.scope;

        if (hooks.beforeHandle) {
            chain.addStage('beforeHandle', toHookArray(hooks.beforeHandle), scope, plugin.name);
        }
        if (hooks.afterHandle) {
            chain.addStage('afterHandle', toHookArray(hooks.afterHandle), scope, plugin.name);
        }
        if (hooks.onResponse) {
            chain.addStage('onResponse', toHookArray(hooks.onResponse), scope, plugin.name);
        }
        if (hooks.onError) {
            chain.addStage('onError', toHookArray(hooks.onError), scope, plugin.name);
        }
        if (hooks.provide) {
            // Plugin provide keys are accumulated at the plan level, not as chain
            // nodes. The caller must merge provide records after flattening.
        }
    }
}

function toHookArray<T>(h: T | T[] | undefined): T[] {
    if (h === undefined) return [];
    return Array.isArray(h) ? h : [h];
}
