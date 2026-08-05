import * as path from 'path';

/**
 * Shared route conventions for CLI scanning and code generation.
 * Must match framework routing rules (packages/burger-api pathConversion). Sync check: bun run test:route-sync (from repo root).
 */
export const ROUTE_CONSTANTS = {
    SUPPORTED_PAGE_EXTENSIONS: ['.tsx', '.html'],
    PAGE_INDEX_FILES: ['index.tsx', 'index.html'],
    /** Convention file extensions (route/schema/hooks/openapi/config) per vision. */
    CONVENTION_EXTENSIONS: ['.ts', '.js', '.mjs'] as const,
    DYNAMIC_SEGMENT_PREFIX: ':',
    DYNAMIC_FOLDER_START: '[',
    DYNAMIC_FOLDER_END: ']',
    GROUPING_FOLDER_START: '(',
    GROUPING_FOLDER_END: ')',
    WILDCARD_SEGMENT_PREFIX: '*',
    WILDCARD_SIMPLE: '[...]',
    WILDCARD_START: '[...',
};

/**
 * Returns `{ stem, ext }` when `filename` is a convention-named file
 * (`route.ts`, `schema.js`, `hooks.mjs`, …), or `undefined` otherwise.
 */
export function splitConventionName(
    filename: string
): { stem: string; ext: string } | undefined {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0) return undefined;
    const ext = filename.slice(dot);
    if (
        !(ROUTE_CONSTANTS.CONVENTION_EXTENSIONS as readonly string[]).includes(
            ext
        )
    ) {
        return undefined;
    }
    return { stem: filename.slice(0, dot), ext };
}

/**
 * Cleans a prefix by removing leading and trailing slashes.
 * @param prefix The prefix to clean.
 * @returns The cleaned prefix.
 */
function cleanPrefix(prefix: string): string {
    let p = prefix;
    while (p.startsWith('/')) p = p.slice(1);
    while (p.endsWith('/')) p = p.slice(0, -1);
    return p;
}

/**
 * Converts a file path to an API route path.
 * @param filePath The file path to convert.
 * @param prefix The prefix to prepend to the route path.
 * @returns The API route path.
 */
export function filePathToApiRoutePath(
    filePath: string,
    prefix: string
): string {
    for (const ext of ROUTE_CONSTANTS.CONVENTION_EXTENSIONS) {
        if (filePath.endsWith(`route${ext}`)) {
            filePath = filePath.slice(0, -`route${ext}`.length);
            break;
        }
    }

    const segments = filePath.split(path.sep);
    const resultSegments: string[] = [];

    for (const segment of segments) {
        if (!segment) continue;
        if (
            segment.startsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_START) &&
            segment.endsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_END)
        ) {
            continue;
        }
        if (
            segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
            segment.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END) &&
            !segment.startsWith(ROUTE_CONSTANTS.WILDCARD_START)
        ) {
            resultSegments.push(
                ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX + segment.slice(1, -1)
            );
        } else if (segment === ROUTE_CONSTANTS.WILDCARD_SIMPLE) {
            resultSegments.push(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX);
        } else {
            resultSegments.push(segment);
        }
    }

    let route = '/' + resultSegments.join('/');
    const clean = cleanPrefix(prefix);
    if (clean) {
        route = '/' + clean + route;
    }
    if (route !== '/' && route.endsWith('/')) {
        route = route.slice(0, -1);
    }
    return route;
}

/**
 * Converts a file path to a page route path.
 * @param filePath The file path to convert.
 * @param prefix The prefix to prepend to the route path.
 * @returns The page route path.
 */
export function filePathToPageRoutePath(
    filePath: string,
    prefix: string
): string {
    const segments = filePath.split(path.sep);
    const resultSegments: string[] = [];

    for (const segment of segments) {
        if (!segment) continue;
        if (
            segment.startsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_START) &&
            segment.endsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_END)
        ) {
            continue;
        }
        if (
            segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
            segment.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END)
        ) {
            resultSegments.push(
                ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX + segment.slice(1, -1)
            );
        } else {
            resultSegments.push(segment);
        }
    }

    let route = '/' + resultSegments.join('/');
    const clean = cleanPrefix(prefix);
    if (clean) {
        route = '/' + clean + route;
    }
    if (route !== '/' && route.endsWith('/')) {
        route = route.slice(0, -1);
    }

    const pathSegments = route.split('/');
    const lastSegment = pathSegments.at(-1);
    if (typeof lastSegment === 'string') {
        if (ROUTE_CONSTANTS.PAGE_INDEX_FILES.includes(lastSegment)) {
            pathSegments.pop();
        } else {
            const extensionIndex = lastSegment.lastIndexOf('.');
            if (extensionIndex > 0) {
                pathSegments[pathSegments.length - 1] = lastSegment.slice(
                    0,
                    extensionIndex
                );
            }
        }
    }

    return pathSegments.join('/') === '' ? '/' : pathSegments.join('/');
}
