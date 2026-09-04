import * as path from 'path';
import { cleanPrefix } from './index.js';
import { ROUTE_CONSTANTS } from './routing.js';

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
    for (const ext of ['.ts', '.js', '.mjs']) {
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
            segment.includes(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END)
        ) {
            // Page dynamic segments are FILENAMES (`[name].tsx`) — the
            // extension trails the closing bracket, so match on `includes`.
            const end = segment.indexOf(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END);
            resultSegments.push(
                ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX + segment.slice(1, end)
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
