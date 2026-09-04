import { resolve } from 'path';

// Export constants
export {
    ROUTE_CONSTANTS,
    HTTP_METHODS,
    compareRoutes,
    getRouteSpecificity,
    collectRoutes,
} from './routing.js';

/**
 * Resolves the given path to the specified directory.
 * @param directory the directory to resolve to
 * @param path the path to resolve
 * @returns the resolved path
 */
export function setDir(directory: string, path: string): string {
    return resolve(directory, path);
}

/**
 * Removes leading and trailing slashes from the given prefix.
 * @param prefix the prefix to clean
 * @returns the cleaned prefix
 */
export function cleanPrefix(prefix: string): string {
    // Remove all slashes from the beginning
    while (prefix.startsWith('/')) {
        prefix = prefix.slice(1);
    }
    // Remove all slashes from the end
    while (prefix.endsWith('/')) {
        prefix = prefix.slice(0, -1);
    }
    return prefix;
}

/**
 * Normalizes a file path by replacing multiple slashes with a single slash
 * and removing any trailing slash, unless the path is the root.
 * @param path The file path to normalize.
 * @returns The normalized file path.
 */
export function normalizePath(path: string): string {
    // Replace multiple slashes with a single slash
    let normalized = path.replace(/\/+/g, '/');

    // Remove trailing slash if it's not the root
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }

    return normalized;
}
