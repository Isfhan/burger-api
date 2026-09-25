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
 * - `config.ts` provides per-route options exposed as `ctx.config`. Core
 *   honors only `responseValidation`; other keys (auth, cache, timeout, …)
 *   are data read by plugins / hooks.
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

/** HTTP lifecycle hook names (the app-level `hooks.ts` / `globalHooks`). */
export const GLOBAL_HOOK_NAMES = [
    'onRequest',
    'transform',
    'beforeRoute',
    'afterRoute',
    'mapResponse',
    'onError',
] as const;

/** WebSocket hooks the app-level `hooks.ts` may also export. */
const GLOBAL_WS_HOOK_NAMES = ['onOpen', 'onMessage', 'onClose'] as const;

/** Hook names valid in a route's `hooks.ts` (no `onRequest` — it runs pre-routing). */
export const ROUTE_HOOK_NAMES = GLOBAL_HOOK_NAMES.filter(
    (n) => n !== 'onRequest'
);

/**
 * Warns (once per file load) about exports a convention file declares that
 * the framework will never read — a typo (`beforeRout`) or a hook in the
 * wrong scope (`onRequest` in a route `hooks.ts`) would otherwise be
 * silently ignored.
 */
export function warnUnknownHookExports(
    hooks: Record<string, unknown> | undefined,
    file: string,
    scope: 'global' | 'route'
): void {
    if (!hooks || typeof hooks !== 'object') return;
    const valid: readonly string[] =
        scope === 'global'
            ? [...GLOBAL_HOOK_NAMES, ...GLOBAL_WS_HOOK_NAMES]
            : ROUTE_HOOK_NAMES;
    for (const key of Object.keys(hooks)) {
        if (key === 'default' || key === '__esModule' || valid.includes(key)) {
            continue;
        }
        const hint =
            key === 'onRequest'
                ? ' onRequest runs before routing, so it cannot be route-scoped — move it to the app-level src/hooks.ts or a plugin.'
                : ` Valid names: ${valid.join(', ')}.`;
        console.warn(
            `[burger-api] ${file}: export "${key}" is not a hook name and is ignored.${hint}`
        );
    }
}

/**
 * Warns about `route.ts` exports that look like handlers but will never be
 * registered: lowercase method names (`get`) or non-function method exports.
 */
export function warnUnknownRouteExports(
    mod: Record<string, unknown>,
    file: string,
    methods: readonly string[]
): void {
    for (const key of Object.keys(mod)) {
        const upper = key.toUpperCase();
        if (!methods.includes(upper)) continue;
        if (key !== upper) {
            console.warn(
                `[burger-api] ${file}: export "${key}" is ignored — handler exports must be uppercase (${upper}). Valid names: ${methods.join(', ')}.`
            );
        } else if (typeof mod[key] !== 'function') {
            console.warn(
                `[burger-api] ${file}: export "${key}" is not a function and is ignored — export a handler: export async function ${key}(ctx) { ... }`
            );
        }
    }
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
