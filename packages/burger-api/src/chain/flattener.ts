import type {
    ForwardHook,
    ResponseHook,
    ErrorHook,
    HookPlan,
} from '../lifecycle/types.js';
import type { HookChain } from './chain.js';
import type { ChainNode } from './node.js';
import type { Scope } from './node.js';

/**
 * Execution order for request hooks (beforeRoute):
 * Framework → Plugin → Global → Local
 *
 * This is the single source of truth for request-hook ordering — kept in
 * sync with `AGENTS.md`'s lifecycle scope description by
 * `test/chain/flatten-order.test.ts`, which reads that file and fails if the
 * two drift apart.
 */
const SCOPE_ORDER_REQUEST: readonly Scope[] = [
    'framework',
    'plugin',
    'global',
    'local',
];

/**
 * Execution order for response/error hooks (afterRoute, mapResponse,
 * onError): Local → Global → Plugin → Framework (nearest-first).
 *
 * Single source of truth — see {@link SCOPE_ORDER_REQUEST}.
 */
const SCOPE_ORDER_RESPONSE: readonly Scope[] = [
    'local',
    'global',
    'plugin',
    'framework',
];

/** Buckets one hook kind by scope, in insertion order within each scope. */
function bucketByScope<T>(): Record<Scope, T[]> {
    return { framework: [], global: [], plugin: [], local: [] };
}

/** Flattens scope buckets into a single array following `order`. */
function orderBuckets<T>(buckets: Record<Scope, T[]>, order: readonly Scope[]): T[] {
    const out: T[] = [];
    for (const scope of order) out.push(...buckets[scope]);
    return out;
}

export function flatten(chain: HookChain, _routeOwner: string): HookPlan {
    const nodes = chain.getNodes();

    let validation: ForwardHook | undefined;
    const before = bucketByScope<ForwardHook>();
    const after = bucketByScope<ResponseHook>();
    const mapResp = bucketByScope<ResponseHook>();
    const error = bucketByScope<ErrorHook>();

    for (const node of nodes) {
        // The ChainNode is discriminated on `stage`, so `fn` narrows to the
        // stage's precise hook type without assertions.
        switch (node.stage) {
            case 'validation': {
                validation = node.fn;
                break;
            }
            case 'beforeRoute': {
                before[node.scope].push(node.fn);
                break;
            }
            case 'afterRoute': {
                after[node.scope].push(node.fn);
                break;
            }
            case 'mapResponse': {
                mapResp[node.scope].push(node.fn);
                break;
            }
            case 'onError': {
                error[node.scope].push(node.fn);
                break;
            }
        }
    }

    const plan: HookPlan = {
        beforeRoute: orderBuckets(before, SCOPE_ORDER_REQUEST),
        afterRoute: orderBuckets(after, SCOPE_ORDER_RESPONSE),
        mapResponse: orderBuckets(mapResp, SCOPE_ORDER_RESPONSE),
        onError: orderBuckets(error, SCOPE_ORDER_RESPONSE),
    };
    if (validation) plan.validation = validation;
    return plan;
}
