/**
 * Build-time detection of which HTTP methods a route module exports.
 * Used so the virtual entry only emits handler keys for methods that exist.
 */

import { readFile } from 'fs/promises';

const HTTP_METHOD_NAMES = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'HEAD',
    'OPTIONS',
] as const;

/** Matches export async function GET( or export function POST( */
const EXPORT_FUNCTION_RE =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/g;

/** Matches export { ... } and captures the content between braces */
const EXPORT_NAMED_BLOCK_RE = /export\s*\{([^}]*)\}/g;

/**
 * Matches export const GET = ..., export const POST: Handler = ... (optional
 * type annotation) and let/var variants.
 */
const EXPORT_CONST_RE =
    /export\s+(?:const|let|var)\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b\s*[:=]/g;

/** Matches destructured exports: export const { GET, POST } = ... */
const EXPORT_DESTRUCTURE_RE = /export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=/g;

/** Matches a single HTTP method name inside an export block. */
const METHOD_NAME_RE = /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g;

/**
 * Strip block comments and full-line comments so the export regexes below
 * don't match inside them.
 */
function stripComments(content: string): string {
    let out = content.replace(/\/\*[\s\S]*?\*\//g, ' ');
    out = out.replace(/^\s*\/\/[^\n]*$/gm, '\n');
    return out;
}

/**
 * Detect the HTTP methods a route file exports (function, const, named and
 * destructured exports).
 *
 * @param filePath - Absolute path to the route file (e.g. route.ts).
 * @returns Method names found, or undefined if the file could not be read.
 */
export async function detectExportedMethods(
    filePath: string
): Promise<string[] | undefined> {
    let content: string;
    try {
        content = await readFile(filePath, 'utf-8');
    } catch {
        return undefined;
    }

    const contentWithoutComments = stripComments(content);
    const found = new Set<string>();

    let match: RegExpExecArray | null;
    EXPORT_FUNCTION_RE.lastIndex = 0;
    while ((match = EXPORT_FUNCTION_RE.exec(contentWithoutComments)) !== null) {
        const name = match[1];
        if (name) found.add(name);
    }

    EXPORT_CONST_RE.lastIndex = 0;
    while ((match = EXPORT_CONST_RE.exec(contentWithoutComments)) !== null) {
        const name = match[1];
        if (name) found.add(name);
    }

    // Collect method names from each export { ... } / destructured block.
    for (const blockRe of [EXPORT_NAMED_BLOCK_RE, EXPORT_DESTRUCTURE_RE]) {
        blockRe.lastIndex = 0;
        while ((match = blockRe.exec(contentWithoutComments)) !== null) {
            const blockContent = match[1] ?? '';
            let methodMatch: RegExpExecArray | null;
            METHOD_NAME_RE.lastIndex = 0;
            while ((methodMatch = METHOD_NAME_RE.exec(blockContent)) !== null) {
                const name = methodMatch[1];
                if (name) found.add(name);
            }
        }
    }

    const methods = [...found].filter((m) =>
        (HTTP_METHOD_NAMES as readonly string[]).includes(m)
    );
    return methods.length > 0 ? methods : undefined;
}

/** Lifecycle hook export names recognized in `hooks.ts`. */
export const HOOK_NAMES = [
    'onRequest',
    'beforeRoute',
    'afterRoute',
    'mapResponse',
    'onError',
    'transform',
] as const;

/**
 * Matches `export const beforeRoute = ...` and the typed form
 * `export const beforeRoute: RouteHooks['beforeRoute'] = ...` (and the
 * other hook names).
 */
const EXPORT_HOOK_CONST_RE =
    /export\s+(?:const|let|var)\s+(onRequest|beforeRoute|afterRoute|mapResponse|onError|transform)\b\s*[:=]/g;

/** Matches a single hook name (inside export { } / destructuring blocks). */
const HOOK_NAME_RE =
    /\b(onRequest|beforeRoute|afterRoute|mapResponse|onError|transform)\b/g;

/** Matches `export function beforeRoute( ...` (and the other hook names). */
const EXPORT_HOOK_FUNCTION_RE =
    /export\s+(?:async\s+)?function\s+(onRequest|beforeRoute|afterRoute|mapResponse|onError|transform)\s*\(/g;

/**
 * Detect the lifecycle hook names a `hooks.ts` module exports. Display-only
 * (`inspect`): the build imports a present hooks file directly rather than
 * trusting this best-effort guess.
 */
export async function detectExportedHookNames(
    filePath: string
): Promise<string[] | undefined> {
    let content: string;
    try {
        content = await readFile(filePath, 'utf-8');
    } catch {
        return undefined;
    }

    const contentWithoutComments = stripComments(content);
    const found = new Set<string>();

    let match: RegExpExecArray | null;
    EXPORT_HOOK_CONST_RE.lastIndex = 0;
    while (
        (match = EXPORT_HOOK_CONST_RE.exec(contentWithoutComments)) !== null
    ) {
        if (match[1]) found.add(match[1]);
    }

    EXPORT_HOOK_FUNCTION_RE.lastIndex = 0;
    while (
        (match = EXPORT_HOOK_FUNCTION_RE.exec(contentWithoutComments)) !== null
    ) {
        if (match[1]) found.add(match[1]);
    }

    for (const blockRe of [EXPORT_NAMED_BLOCK_RE, EXPORT_DESTRUCTURE_RE]) {
        blockRe.lastIndex = 0;
        while ((match = blockRe.exec(contentWithoutComments)) !== null) {
            const blockContent = match[1] ?? '';
            let hookMatch: RegExpExecArray | null;
            HOOK_NAME_RE.lastIndex = 0;
            while ((hookMatch = HOOK_NAME_RE.exec(blockContent)) !== null) {
                if (hookMatch[1]) found.add(hookMatch[1]);
            }
        }
    }

    const hooks = [...found].filter((h) =>
        (HOOK_NAMES as readonly string[]).includes(h)
    );
    return hooks.length > 0 ? hooks : undefined;
}
