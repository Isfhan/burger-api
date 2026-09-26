import type { ContextSet } from './types.js';

/** Mutation flag: `set.status` was assigned. */
export const SET_STATUS = 1;
/** Mutation flag: `set.headers` was assigned. */
export const SET_HEADERS = 2;

/**
 * The lazily allocated `ctx.set`, backed by accessors so every assignment
 * flips a flag. `applySet` then knows exactly what changed (status-only vs
 * headers vs both) without re-scanning the object — mirroring Elysia 2's
 * compile-time response modes and Elysia 1's three-property `mapResponse`
 * check (research report item #6).
 *
 * Private fields keep the instance shape invisible to user code
 * (`Object.keys(ctx.set)` does not leak the backing storage).
 */
export class TrackedContextSet implements ContextSet {
    #flags = 0;
    #status: number | undefined;
    #headers: Record<string, string> | Headers | undefined;

    /** Bitmask of the fields that were assigned (`SET_STATUS` / `SET_HEADERS`). */
    get flags(): number {
        return this.#flags;
    }

    get status(): number | undefined {
        return this.#status;
    }

    set status(value: number | undefined) {
        this.#status = value;
        this.#flags |= SET_STATUS;
    }

    get headers(): Record<string, string> | Headers | undefined {
        return this.#headers;
    }

    set headers(value: Record<string, string> | Headers | undefined) {
        this.#headers = value;
        this.#flags |= SET_HEADERS;
    }

    /** Keeps `JSON.stringify(ctx.set)` / logging as readable as a plain object. */
    toJSON(): ContextSet {
        return { status: this.#status, headers: this.#headers };
    }
}
