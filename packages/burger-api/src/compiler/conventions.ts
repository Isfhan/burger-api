/**
 * File-based routing conventions for the compiler pipeline.
 *
 * These are the single source of truth for which sibling files the
 * Directory Scanner recognizes inside a route directory, and which names
 * are explicitly forbidden.
 *
 * Locked architecture:
 * - A route directory is self-contained; sibling files are discovered by convention.
 * - There is **no `middleware.ts`**. Infrastructure is written as hooks.
 * - There is **no `use.ts`** or **`webhook.ts`**. Use ecosystem plugins instead.
 * - `config.ts` provides per-route options (auth, cache, timeout, …).
 */

/** The convention files the scanner recognizes (without the extension). */
export const CONVENTION_FILES = [
    'route',
    'schema',
    'hooks',
    'openapi',
    'config',
] as const;

/** A recognized convention file stem (the part before the extension). */
export type ConventionFile = (typeof CONVENTION_FILES)[number];

/** File extensions accepted for convention files (vision: `.ts` / `.js` / `.mjs`). */
export const CONVENTION_EXTENSIONS = ['.ts', '.js', '.mjs'] as const;

/**
 * Forbidden files. BurgerAPI has no separate middleware concept — the
 * lifecycle is expressed only through hooks. Discovery of these files is a
 * compile-time error (fail fast).
 */
export const FORBIDDEN_FILES = ['middleware', 'use', 'webhook'] as const;

/**
 * Returns `{ stem, ext }` when `filename` is a recognized convention file
 * (`route.ts`, `schema.js`, `hooks.mjs`, …), or `undefined` otherwise.
 */
export function splitConventionName(
    filename: string
): { stem: string; ext: string } | undefined {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0) return undefined;
    const ext = filename.slice(dot);
    if (!(CONVENTION_EXTENSIONS as readonly string[]).includes(ext)) {
        return undefined;
    }
    return { stem: filename.slice(0, dot), ext };
}

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
            `Forbidden convention file "${stem}" discovered (any of .ts/.js/.mjs). ` +
                `BurgerAPI has no middleware or webhook concept — write ` +
                `infrastructure code as hooks in "hooks.ts" instead.`
        );
    }
}
