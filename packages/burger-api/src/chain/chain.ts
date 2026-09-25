import type { ForwardHook, ResponseHook, ErrorHook } from '../lifecycle/types.js';
import type { ChainNode, Scope } from './node.js';

export class HookChain {
    private nodes: ChainNode[] = [];

    add(node: ChainNode): void {
        this.nodes.push(node);
    }

    /**
     * Stage hooks with their function types checked against the stage:
     * forward stages take `ForwardHook`s, response stages take
     * `ResponseHook`s, the error stage takes `ErrorHook`s.
     */
    addStage(
        stage: 'validation' | 'beforeRoute',
        fns: ForwardHook[],
        scope: Scope,
        owner: string
    ): void;
    addStage(
        stage: 'afterRoute' | 'mapResponse',
        fns: ResponseHook[],
        scope: Scope,
        owner: string
    ): void;
    addStage(
        stage: 'onError',
        fns: ErrorHook[],
        scope: Scope,
        owner: string
    ): void;
    addStage(
        stage: ChainNode['stage'],
        fns: ForwardHook[] | ResponseHook[] | ErrorHook[],
        scope: Scope,
        owner: string
    ): void {
        for (const fn of fns) {
            this.nodes.push({ stage, fn, scope, owner } as ChainNode);
        }
    }

    getNodes(): readonly ChainNode[] {
        return this.nodes;
    }

    clear(): void {
        this.nodes = [];
    }
}
