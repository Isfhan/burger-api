import type {
    ForwardHook,
    ResponseHook,
    ErrorHook,
} from '../lifecycle/types.js';

export type Scope = 'framework' | 'global' | 'plugin' | 'local';

/**
 * A single hook staged in the chain, with the hook function typed to the
 * stage it belongs to. Discriminated on `stage` so the flattener can narrow
 * `fn` without assertions.
 */
export type ChainNode =
    | {
          stage: 'validation' | 'beforeRoute';
          fn: ForwardHook;
          scope: Scope;
          owner: string;
          parent?: ChainNode;
      }
    | {
          stage: 'afterRoute' | 'mapResponse';
          fn: ResponseHook;
          scope: Scope;
          owner: string;
          parent?: ChainNode;
      }
    | {
          stage: 'onError';
          fn: ErrorHook;
          scope: Scope;
          owner: string;
          parent?: ChainNode;
      };
