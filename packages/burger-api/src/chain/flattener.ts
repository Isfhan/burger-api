import type { Hook, ErrorHook, HookPlan } from '../lifecycle/types';
import type { HookChain } from './chain';
import type { ChainNode } from './node';

/**
 * Execution order for request hooks (beforeRoute):
 * Framework → Plugin → Global → Local
 */
const SCOPE_ORDER_REQUEST = ['framework', 'plugin', 'global', 'local'];

/**
 * Execution order for response/error hooks (afterRoute, mapResponse, onError):
 * Local → Global → Plugin → Framework
 */
const SCOPE_ORDER_RESPONSE = ['local', 'global', 'plugin', 'framework'];

function pushByScope(
    buckets: Record<string, unknown[]>,
    scope: string,
    fn: unknown
): void {
    if (buckets[scope]) {
        buckets[scope].push(fn);
    } else {
        // Unknown scope falls through to the innermost bucket.
        // For request hooks that's 'local'; for response hooks that's 'framework'.
        const keys = Object.keys(buckets);
        buckets[keys[keys.length - 1]].push(fn);
    }
}

export function flatten(chain: HookChain, _routeOwner: string): HookPlan {
    const nodes = chain.getNodes();

    let validation: Hook | undefined;
    const beforeRoute: Hook[] = [];
    const afterRoute: Hook[] = [];
    const mapResponse: Hook[] = [];
    const onError: ErrorHook[] = [];

    const frameworkBefore: Hook[] = [];
    const globalBefore: Hook[] = [];
    const pluginBefore: Hook[] = [];
    const localBefore: Hook[] = [];

    const localAfter: Hook[] = [];
    const globalAfter: Hook[] = [];
    const pluginAfter: Hook[] = [];
    const frameworkAfter: Hook[] = [];

    const localResp: Hook[] = [];
    const globalResp: Hook[] = [];
    const pluginResp: Hook[] = [];
    const frameworkResp: Hook[] = [];

    const localError: ErrorHook[] = [];
    const globalError: ErrorHook[] = [];
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
                else if (node.scope === 'global') globalBefore.push(fn);
                else if (node.scope === 'plugin') pluginBefore.push(fn);
                else localBefore.push(fn);
                break;
            }
            case 'afterRoute': {
                const fn = node.fn as Hook;
                if (node.scope === 'framework') frameworkAfter.push(fn);
                else if (node.scope === 'global') globalAfter.push(fn);
                else if (node.scope === 'plugin') pluginAfter.push(fn);
                else localAfter.push(fn);
                break;
            }
            case 'mapResponse': {
                const fn = node.fn as Hook;
                if (node.scope === 'framework') frameworkResp.push(fn);
                else if (node.scope === 'global') globalResp.push(fn);
                else if (node.scope === 'plugin') pluginResp.push(fn);
                else localResp.push(fn);
                break;
            }
            case 'onError': {
                const fn = node.fn as ErrorHook;
                if (node.scope === 'local') localError.push(fn);
                else if (node.scope === 'global') globalError.push(fn);
                else if (node.scope === 'plugin') pluginError.push(fn);
                else frameworkError.push(fn);
                break;
            }
        }
    }

    // Request hooks: Framework → Plugin → Global → Route (forward)
    beforeRoute.push(
        ...frameworkBefore,
        ...pluginBefore,
        ...globalBefore,
        ...localBefore
    );
    // Response hooks: Route → Global → Plugin → Framework (reversed)
    afterRoute.push(
        ...localAfter,
        ...globalAfter,
        ...pluginAfter,
        ...frameworkAfter
    );
    mapResponse.push(
        ...localResp,
        ...globalResp,
        ...pluginResp,
        ...frameworkResp
    );
    // Error hooks: Route → Global → Plugin → Framework (reversed, nearest-first)
    onError.push(
        ...localError,
        ...globalError,
        ...pluginError,
        ...frameworkError
    );

    const plan: HookPlan = { beforeRoute, afterRoute, mapResponse, onError };
    if (validation) plan.validation = validation;
    return plan;
}
