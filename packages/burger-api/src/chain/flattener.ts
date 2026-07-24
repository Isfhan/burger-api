import type { Hook, ErrorHook, HookPlan } from '../lifecycle/types';
import type { HookChain } from './chain';
import type { ChainNode } from './node';

const SCOPE_RANK: Record<string, number> = {
    global: 0,
    plugin: 1,
    local: 2,
};

const SCOPE_RANK_ERROR: Record<string, number> = {
    local: 0,
    plugin: 1,
    global: 2,
};

export function flatten(
    chain: HookChain,
    _routeOwner: string
): HookPlan {
    const nodes = chain.getNodes();

    const beforeRoute: Hook[] = [];
    const afterRoute: Hook[] = [];
    const mapResponse: Hook[] = [];
    const onError: ErrorHook[] = [];

    const globalBefore: Hook[] = [];
    const pluginBefore: Hook[] = [];
    const localBefore: Hook[] = [];

    const globalAfter: Hook[] = [];
    const pluginAfter: Hook[] = [];
    const localAfter: Hook[] = [];

    const globalResp: Hook[] = [];
    const pluginResp: Hook[] = [];
    const localResp: Hook[] = [];

    const localError: ErrorHook[] = [];
    const pluginError: ErrorHook[] = [];
    const globalError: ErrorHook[] = [];

    for (const node of nodes) {
        switch (node.stage) {
            case 'beforeRoute': {
                const fn = node.fn as Hook;
                if (node.scope === 'global') globalBefore.push(fn);
                else if (node.scope === 'plugin') pluginBefore.push(fn);
                else localBefore.push(fn);
                break;
            }
            case 'afterRoute': {
                const fn = node.fn as Hook;
                if (node.scope === 'global') globalAfter.push(fn);
                else if (node.scope === 'plugin') pluginAfter.push(fn);
                else localAfter.push(fn);
                break;
            }
            case 'mapResponse': {
                const fn = node.fn as Hook;
                if (node.scope === 'global') globalResp.push(fn);
                else if (node.scope === 'plugin') pluginResp.push(fn);
                else localResp.push(fn);
                break;
            }
            case 'onError': {
                const fn = node.fn as ErrorHook;
                if (node.scope === 'local') localError.push(fn);
                else if (node.scope === 'plugin') pluginError.push(fn);
                else globalError.push(fn);
                break;
            }
        }
    }

    beforeRoute.push(...globalBefore, ...pluginBefore, ...localBefore);
    afterRoute.push(...globalAfter, ...pluginAfter, ...localAfter);
    mapResponse.push(...globalResp, ...pluginResp, ...localResp);
    onError.push(...localError, ...pluginError, ...globalError);

    return { beforeRoute, afterRoute, mapResponse, onError };
}
