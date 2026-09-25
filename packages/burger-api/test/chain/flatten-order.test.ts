/**
 * Hook-scope ordering is expressed in three places that must agree: the
 * loader's merge order (global hooks merged before route hooks —
 * `compiler/module-loader.ts`), the chain's per-scope buckets
 * (`chain/flattener.ts`), and `AGENTS.md`'s prose description of the
 * lifecycle. Nothing previously asserted these stay in sync — this is
 * exactly how `AGENTS.md` drifted from the real flattener order (see
 * `docs/RELEASE-1.0.0-AUDIT.md`, Phase 2 item 1).
 *
 * This file has two halves:
 * 1. A behavioral test driving `flatten()` directly and asserting the exact
 *    execution order across all four scopes, for both hook directions.
 * 2. A doc-sync test that reads `AGENTS.md` and fails if its stated order no
 *    longer matches the behavioral order above.
 */
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HookChain } from '../../src/chain/chain';
import { flatten } from '../../src/chain/flattener';
import type { Scope } from '../../src/chain/node';

const SCOPES: Scope[] = ['local', 'global', 'plugin', 'framework'];

function buildChain(
    stage: 'beforeRoute' | 'afterRoute' | 'mapResponse' | 'onError',
    order: string[]
): HookChain {
    const chain = new HookChain();
    for (const scope of SCOPES) {
        chain.addStage(
            stage as 'beforeRoute',
            [
                (() => {
                    order.push(scope);
                    return undefined;
                }) as never,
            ],
            scope,
            `owner-${scope}`
        );
    }
    return chain;
}

describe('flatten() scope order — behavioral source of truth', () => {
    it('beforeRoute runs Framework → Plugin → Global → Local', async () => {
        const order: string[] = [];
        const plan = flatten(buildChain('beforeRoute', order), '/r');
        for (const hook of plan.beforeRoute) await hook(undefined as never);
        expect(order).toEqual(['framework', 'plugin', 'global', 'local']);
    });

    it('afterRoute runs Local → Global → Plugin → Framework', async () => {
        const order: string[] = [];
        const plan = flatten(buildChain('afterRoute', order), '/r');
        for (const hook of plan.afterRoute) await hook(undefined as never);
        expect(order).toEqual(['local', 'global', 'plugin', 'framework']);
    });

    it('mapResponse runs Local → Global → Plugin → Framework', async () => {
        const order: string[] = [];
        const plan = flatten(buildChain('mapResponse', order), '/r');
        for (const hook of plan.mapResponse) await hook(undefined as never);
        expect(order).toEqual(['local', 'global', 'plugin', 'framework']);
    });

    it('onError runs nearest-first: Local → Global → Plugin → Framework', async () => {
        const order: string[] = [];
        const plan = flatten(buildChain('onError', order), '/r');
        for (const hook of plan.onError) {
            await hook(new Error('x') as never, undefined as never);
        }
        expect(order).toEqual(['local', 'global', 'plugin', 'framework']);
    });
});

describe('AGENTS.md stays in sync with the behavioral order above', () => {
    const agentsMd = readFileSync(
        join(__dirname, '../../../../AGENTS.md'),
        'utf-8'
    );

    it('documents response/error hook order as Route → Global → Plugin → Framework', () => {
        // Matches the behavioral order above: route ("local" scope) is
        // documented as "Route" in AGENTS.md's prose.
        expect(agentsMd).toContain(
            'Response hooks (`afterRoute`, `mapResponse`) run Route → Global → Plugin → Framework'
        );
        expect(agentsMd).toContain(
            'Error hooks (`onError`) run nearest-first, Route → Global → Plugin → Framework'
        );
    });

    it('documents request-hook (beforeRoute) order as Framework → Plugin → Global → Route', () => {
        expect(agentsMd).toContain(
            'Scopes: Framework → Plugin → Global → Route for request hooks'
        );
    });
});
