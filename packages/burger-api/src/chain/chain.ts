import type { Hook, ErrorHook, HookStage } from '../lifecycle/types';
import type { ChainNode, Scope } from './node';

export class HookChain {
    private nodes: ChainNode[] = [];

    add(node: ChainNode): void {
        this.nodes.push(node);
    }

    addStage(
        stage: HookStage | 'onError',
        fns: (Hook | ErrorHook)[],
        scope: Scope,
        owner: string
    ): void {
        for (const fn of fns) {
            this.nodes.push({ stage, fn, scope, owner });
        }
    }

    getNodes(): readonly ChainNode[] {
        return this.nodes;
    }

    clear(): void {
        this.nodes = [];
    }
}
