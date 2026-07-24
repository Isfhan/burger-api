import type { Hook, ErrorHook, HookStage } from '../lifecycle/types';

export type Scope = 'global' | 'plugin' | 'local';

export interface ChainNode {
    stage: HookStage | 'onError';
    fn: Hook | ErrorHook;
    scope: Scope;
    owner: string;
    parent?: ChainNode;
}
