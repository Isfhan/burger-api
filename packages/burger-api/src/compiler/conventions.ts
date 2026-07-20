/**
 * File-based routing conventions for the compiler pipeline.
 *
 * These are the single source of truth for which sibling files the
 * Directory Scanner recognizes inside a route (or group) directory, and
 * which names are explicitly forbidden.
 *
 * Per the frozen v2 architecture (`ROADMAP.md` §3):
 * - A route directory is a module; sibling files are discovered by convention.
 * - There is **no `middleware.ts`**. Infrastructure is written as hooks.
 * - `use.ts` declares capabilities (plugins); `hooks.ts` holds the lifecycle.
 */

/** The convention files the scanner recognizes (without the `.ts` extension). */
export const CONVENTION_FILES = [
    'route',
    'schema',
    'hooks',
    'use',
    'openapi',
    'webhook',
] as const;

/** A recognized convention file stem (the part before `.ts`). */
export type ConventionFile = (typeof CONVENTION_FILES)[number];

/** Files that may participate in group inheritance (no `route.ts`). */
export const INHERITABLE_FILES: readonly ConventionFile[] = [
    'schema',
    'hooks',
    'use',
    'openapi',
];

/**
 * The one forbidden file. The v2 architecture removes the separate middleware
 * concept entirely — lifecycle is expressed only through hooks. Discovery of a
 * `middleware.ts` is a compile-time error (fail fast, per `ROADMAP.md` §6.3).
 */
export const FORBIDDEN_FILE = 'middleware';

/**
 * Returns true if `name` (a file stem, no extension) is a recognized
 * convention file.
 */
export function isConventionFile(stem: string): stem is ConventionFile {
    return (CONVENTION_FILES as readonly string[]).includes(stem);
}

/**
 * Validates a discovered file stem against the convention.
 * @throws if the file is forbidden (`middleware.ts`).
 */
export function assertConventionFile(stem: string): void {
    if (stem === FORBIDDEN_FILE) {
        throw new Error(
            `Forbidden file "middleware.ts" discovered at "${stem}.ts". ` +
                `BurgerAPI has no middleware concept — express infrastructure ` +
                `as hooks in "hooks.ts" (see ROADMAP.md §3.4).`
        );
    }
}
