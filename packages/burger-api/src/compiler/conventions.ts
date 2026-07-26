/**
 * File-based routing conventions for the compiler pipeline.
 *
 * These are the single source of truth for which sibling files the
 * Directory Scanner recognizes inside a route directory, and which names
 * are explicitly forbidden.
 *
 * Vision (`BURGERAPI_VISION.md` §7):
 * - A route directory is self-contained; sibling files are discovered by convention.
 * - There is **no `middleware.ts`**. Infrastructure is written as hooks.
 * - There is **no `use.ts`** or **`webhook.ts`**. Use ecosystem plugins instead.
 * - `config.ts` provides per-route options (auth, cache, timeout, …).
 */

/** The convention files the scanner recognizes (without the `.ts` extension). */
export const CONVENTION_FILES = [
    'route',
    'schema',
    'hooks',
    'openapi',
    'config',
] as const;

/** A recognized convention file stem (the part before `.ts`). */
export type ConventionFile = (typeof CONVENTION_FILES)[number];

/**
 * Forbidden files. The v2 architecture removes the separate middleware
 * concept entirely — lifecycle is expressed only through hooks. Discovery of
 * these files is a compile-time error (fail fast, per `ROADMAP.md` §6.3).
 */
export const FORBIDDEN_FILES = ['middleware', 'use', 'webhook'] as const;

/**
 * Returns true if `name` (a file stem, no extension) is a recognized
 * convention file.
 */
export function isConventionFile(stem: string): stem is ConventionFile {
    return (CONVENTION_FILES as readonly string[]).includes(stem);
}

/**
 * Validates a discovered file stem against the convention.
 * @throws if the file is forbidden.
 */
export function assertConventionFile(stem: string): void {
    if ((FORBIDDEN_FILES as readonly string[]).includes(stem)) {
        throw new Error(
            `Forbidden file "${stem}.ts" discovered. ` +
                `BurgerAPI has no middleware/webhook concept — express infrastructure ` +
                `as hooks in "hooks.ts" (see ROADMAP.md §3.4).`
        );
    }
}
