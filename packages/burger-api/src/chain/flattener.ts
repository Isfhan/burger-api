import type { Hook, ErrorHook, HookPlan } from '../lifecycle/types';
import type { HookChain } from './chain';
import type { ChainNode } from './node';

const SCOPE_RANK: Record<string, number> = {
    framework: 0,
    plugin: 1,
    global: 2,
    local: 3,
};

const SCOPE_RANK_ERROR: Record<string, number> = {
    local: 0,
    plugin: 1,
    global: 2,
    framework: 3,
};

export function flatten(
    chain: HookChain,
    _routeOwner: string
): HookPlan {
    const nodes = chain.getNodes();

    let validation: Hook | undefined;
    const beforeRoute: Hook[] = [];
    const afterRoute: Hook[] = [];
    const mapResponse: Hook[] = [];
    const onError: ErrorHook[] = [];

    const frameworkBefore: Hook[] = [];
    const pluginBefore: Hook[] = [];
    const localBefore: Hook[] = [];

    const frameworkAfter: Hook[] = [];
    const pluginAfter: Hook[] = [];
    const localAfter: Hook[] = [];

    const frameworkResp: Hook[] = [];
    const pluginResp: Hook[] = [];
    const localResp: Hook[] = [];

    const localError: ErrorHook[] = [];
    const pluginError: ErrorHook[] = [];
    const frameworkError: ErrorHook[] = [];

    for (const node of nodes) {
        switch (node.stage) {
            case 'validation': {
                validation = node.fn as Hook;
                break;
            }
            case 'beforeRoute': {
                const fn = node.fn as Hook;
                if (node.scope === 'framework') frameworkBefore.push(fn);
                else if (node.scope === 'plugin') pluginBefore.push(fn);
                else localBefore.push(fn);
                break;
            }
            case 'afterRoute': {
                const fn = node.fn as Hook;
                if (node.scope === 'framework') frameworkAfter.push(fn);
                else if (node.scope === 'plugin') pluginAfter.push(fn);
                else localAfter.push(fn);
                break;
            }
            case 'mapResponse': {
                const fn = node.fn as Hook;
                if (node.scope === 'framework') frameworkResp.push(fn);
                else if (node.scope === 'plugin') pluginResp.push(fn);
                else localResp.push(fn);
                break;
            }
            case 'onError': {
                const fn = node.fn as ErrorHook;
                if (node.scope === 'local') localError.push(fn);
                else if (node.scope === 'plugin') pluginError.push(fn);
                else frameworkError.push(fn);
                break;
            }
        }
    }

    // Request hooks: Framework → Plugin → Route (forward)
    beforeRoute.push(...frameworkBefore, ...pluginBefore, ...localBefore);
    // Response hooks: Route → Plugin → Framework (reversed)
    afterRoute.push(...localAfter, ...pluginAfter, ...frameworkAfter);
    mapResponse.push(...localResp, ...pluginResp, ...frameworkResp);
    // Error hooks: Route → Plugin → Framework (reversed, nearest-first)
    onError.push(...localError, ...pluginError, ...frameworkError);

    const plan: HookPlan = { beforeRoute, afterRoute, mapResponse, onError };
    if (validation) plan.validation = validation;
    return plan;
}
