/**
 * The validator cache — process-lifetime memoization of compiled validators
 * keyed by schema identity (phase3 §12.5, §13.2, §5).
 *
 * Responsibilities:
 * - Lookup a `CompiledValidator` by identity.
 * - Insert on miss.
 * - Clear on dev hot reload (mirrors RouterCompiler wholesale replace).
 *
 * This module must NOT retain future-phase serialization artifacts at
 * runtime in Phase 3, and must NOT mutate the cache during a production
 * request (phase3 §5.4, §18 R11). The concrete storage mechanism
 * (`Map`) is an implementation detail.
 */

import type { CompiledValidator } from './types';

export class ValidatorCache {
    private store = new Map<string, CompiledValidator>();

    /** Returns the cached validator for `identity`, or undefined on miss. */
    get(identity: string): CompiledValidator | undefined {
        return this.store.get(identity);
    }

    /** Inserts a compiled validator keyed by its identity. */
    set(identity: string, validator: CompiledValidator): void {
        this.store.set(identity, validator);
    }

    /** True when `identity` is already cached. */
    has(identity: string): boolean {
        return this.store.has(identity);
    }

    /**
     * Clears all cached validators. Called on dev hot reload; the next
     * `compile()` pass repopulates it wholesale (phase3 §5.10).
     */
    clear(): void {
        this.store.clear();
    }

    /** Number of currently cached (unique) validators. */
    get size(): number {
        return this.store.size;
    }
}
