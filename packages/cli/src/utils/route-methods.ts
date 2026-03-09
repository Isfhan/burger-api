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

/** Matches export { GET, POST } or export { GET as X, POST } - captures method names */
const EXPORT_NAMED_RE =
    /export\s*\{\s*[^}]*?\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b[^}]*\}/g;

/**
 * Detect which HTTP methods are exported from a route file.
 * Reads the file and looks for export function METHOD( and export { ... METHOD ... }.
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

    const found = new Set<string>();

    let match: RegExpExecArray | null;
    EXPORT_FUNCTION_RE.lastIndex = 0;
    while ((match = EXPORT_FUNCTION_RE.exec(content)) !== null) {
        const name = match[1];
        if (name) found.add(name);
    }

    EXPORT_NAMED_RE.lastIndex = 0;
    while ((match = EXPORT_NAMED_RE.exec(content)) !== null) {
        const name = match[1];
        if (name) found.add(name);
    }

    const methods = [...found].filter((m) =>
        (HTTP_METHOD_NAMES as readonly string[]).includes(m)
    );
    return methods.length > 0 ? methods : undefined;
}
