import type { ContextSet } from './types.js';

/** Mutation flag: `set.status` was assigned. */
export const SET_STATUS = 1;
/** Mutation flag: `set.headers` was assigned. */
export const SET_HEADERS = 2;

/**
 * The lazily allocated `ctx.set`. Accessors flip a flag on every assignment,
 * so `applySet` knows what changed without re-scanning the object.
 * Private fields keep the backing storage out of `Object.keys(ctx.set)`.
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
