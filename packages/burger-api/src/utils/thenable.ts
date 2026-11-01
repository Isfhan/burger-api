/**
 * Hot-path thenable probe used by the sync-first lifecycle stages.
 *
 * `await` on a synchronous value still costs a microtask; checking
 * `typeof value.then === 'function'` first lets a step that returned a plain
 * value continue without suspending.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null &&
        value !== undefined &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}
