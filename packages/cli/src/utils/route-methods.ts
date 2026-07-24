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

/** Matches export const GET = ... or export const POST = async (req) => ... */
const EXPORT_CONST_RE =
    /export\s+const\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*=/g;

/** Matches a single HTTP method name (used to find all methods inside a block) */
const METHOD_NAME_RE = /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g;

/**
 * Strip comments so export regexes do not match inside comments.
 * Removes multi-line comments (/* ... *\/) and lines that are only a single-line comment (// ...).
 */
function stripComments(content: string): string {
    let out = content.replace(/\/\*[\s\S]*?\*\//g, ' ');
    out = out.replace(/^\s*\/\/[^\n]*$/gm, '\n');
    return out;
}

/**
 * Detect which HTTP methods are exported from a route file.
 * Reads the file and looks for export function METHOD(, export const METHOD = ..., and export { ... METHOD ... }.
 *
 * @param filePath - Absolute path to the route file (e.g. route.ts).
 * @returns Array of method names found, or undefined if file could not be read or parsed.
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

    // Scan each export { ... } block and collect all HTTP method names inside it
    EXPORT_NAMED_BLOCK_RE.lastIndex = 0;
    while ((match = EXPORT_NAMED_BLOCK_RE.exec(contentWithoutComments)) !== null) {
        const blockContent = match[1] ?? '';
        let methodMatch: RegExpExecArray | null;
        METHOD_NAME_RE.lastIndex = 0;
        while ((methodMatch = METHOD_NAME_RE.exec(blockContent)) !== null) {
            const name = methodMatch[1];
            if (name) found.add(name);
        }
    }

    const methods = [...found].filter((m) =>
        (HTTP_METHOD_NAMES as readonly string[]).includes(m)
    );
    return methods.length > 0 ? methods : undefined;
}

/** Lifecycle hook export names recognized in `hooks.ts`. */
export const HOOK_NAMES = [
    'beforeRoute',
    'afterRoute',
    'mapResponse',
    'onError',
    'transform',
] as const;

/** Matches `export const beforeRoute = ...` (and the other hook names). */
const EXPORT_HOOK_CONST_RE =
    /export\s+const\s+(beforeRoute|afterRoute|mapResponse|onError|transform)\s*=/g;

/** Matches `export function beforeRoute( ...` (and the other hook names). */
const EXPORT_HOOK_FUNCTION_RE =
    /export\s+(?:async\s+)?function\s+(beforeRoute|afterRoute|mapResponse|onError|transform)\s*\(/g;

/**
 * Detect which lifecycle hook names a `hooks.ts` module exports. Mirrors
 * {@link detectExportedMethods} but for hook exports rather than HTTP methods
 * (Phase 4). Used by the build scanner to decide whether a route directory
 * carries a usable `hooks.ts`.
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
    while ((match = EXPORT_HOOK_CONST_RE.exec(contentWithoutComments)) !== null) {
        if (match[1]) found.add(match[1]);
    }

    EXPORT_HOOK_FUNCTION_RE.lastIndex = 0;
    while (
        (match = EXPORT_HOOK_FUNCTION_RE.exec(contentWithoutComments)) !== null
    ) {
        if (match[1]) found.add(match[1]);
    }

    const hooks = [...found].filter((h) =>
        (HOOK_NAMES as readonly string[]).includes(h)
    );
    return hooks.length > 0 ? hooks : undefined;
}
