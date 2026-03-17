/**
 * GitHub Integration
 *
 * Downloads files from GitHub using Bun's built-in fetch.
 * No extra packages needed - we use the native fetch API that comes with Bun!
 *
 * This module handles all communication with GitHub to:
 * - Get lists of available middleware
 * - Download template files
 * - Download middleware code
 */

import type { GitHubFile, MiddlewareInfo } from '../types/index';
import { unlinkSync } from 'fs';

/**
 * Configuration for GitHub repository.
 * Override via env: BURGER_API_REPO_OWNER, BURGER_API_REPO_NAME, BURGER_API_BRANCH.
 */
const REPO_OWNER = process.env.BURGER_API_REPO_OWNER ?? 'isfhan';
const REPO_NAME = process.env.BURGER_API_REPO_NAME ?? 'burger-api';
const BRANCH = process.env.BURGER_API_BRANCH ?? 'main';

// Build the URLs we'll use to access GitHub
const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

const FETCH_TIMEOUT_MS = 20_000;

function createFetchSignal(): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), {
        once: true,
    });
    return controller.signal;
}

function wrapFetchError(err: unknown, fallbackMessage: string): Error {
    if (err instanceof Error && err.name === 'AbortError') {
        return new Error(
            'Request timed out. Please check your internet connection.'
        );
    }
    return new Error(err instanceof Error ? err.message : fallbackMessage);
}

/**
 * Get list of available middleware from GitHub
 * This scans the ecosystem/middlewares folder and returns what's available
 *
 * @returns Promise with array of middleware names
 * @throws Error if GitHub is unreachable or request fails
 * @example
 * const middleware = await getMiddlewareList();
 * // ['cors', 'logger', 'rate-limiter', ...]
 */
export async function getMiddlewareList(): Promise<string[]> {
    try {
        // Use Bun's native fetch - no node-fetch package needed!
        const response = await fetch(
            `${API_URL}/contents/ecosystem/middlewares`,
            {
                signal: createFetchSignal(),
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }
        );

        // Check if the request was successful
        if (!response.ok) {
            throw new Error(`GitHub returned status ${response.status}`);
        }

        // Parse the JSON response
        const files = (await response.json()) as GitHubFile[];

        // Filter to only show directories (each middleware is in its own folder)
        // Sort alphabetically to make it easier to find things
        return files
            .filter((f) => f.type === 'dir')
            .map((f) => f.name)
            .sort();
    } catch (err) {
        throw wrapFetchError(
            err,
            'Could not get middleware list from GitHub. Please check your internet connection.'
        );
    }
}

/**
 * Get detailed information about a specific middleware
 * This reads the README file to get the description
 *
 * @param name - Name of the middleware (e.g., 'cors')
 * @returns Promise with middleware information
 * @example
 * const info = await getMiddlewareInfo('cors');
 * console.log(info.description);
 */
export async function getMiddlewareInfo(name: string): Promise<MiddlewareInfo> {
    try {
        // Get list of files in the middleware directory
        const response = await fetch(
            `${API_URL}/contents/ecosystem/middlewares/${name}`,
            {
                signal: createFetchSignal(),
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Middleware "${name}" not found`);
        }

        const files = (await response.json()) as GitHubFile[];

        // Try to find and read the README file for description
        const readmeFile = files.find(
            (f) => f.name.toLowerCase() === 'readme.md'
        );
        let description = 'No description available';

        if (readmeFile && readmeFile.download_url) {
            try {
                const readmeResponse = await fetch(readmeFile.download_url, {
                    signal: createFetchSignal(),
                });
                const readmeContent = await readmeResponse.text();

                // Extract first non-empty line after the title as description
                const lines = readmeContent.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        description = trimmed;
                        break;
                    }
                }
            } catch {
                // If we can't read the README, just use default description
            }
        }

        return {
            name,
            description,
            path: `ecosystem/middlewares/${name}`,
            files: files.map((f) => f.name),
        };
    } catch (err) {
        throw wrapFetchError(
            err,
            `Could not get info for middleware "${name}"`
        );
    }
}

/**
 * Download a file from GitHub
 *
 * @param path - Path in the repo (e.g., 'ecosystem/middlewares/cors/cors.ts')
 * @param destination - Where to save it on your computer
 * @returns Promise that resolves when download is complete
 * @throws Error if download fails
 * @example
 * await downloadFile('ecosystem/middlewares/cors/cors.ts', './middleware/cors.ts');
 */
export async function downloadFile(
    path: string,
    destination: string
): Promise<void> {
    try {
        // Build the URL to the raw file content
        const url = `${RAW_URL}/${path}`;

        const response = await fetch(url, {
            signal: createFetchSignal(),
        });

        if (!response.ok) {
            throw new Error(`Could not download ${path}`);
        }

        // Get the file content
        const content = await response.text();

        // Save using Bun's fast file system
        // Bun.write is much faster than Node's fs.writeFile!
        await Bun.write(destination, content);
    } catch (err) {
        throw wrapFetchError(
            err,
            `Failed to download ${path}: ${
                err instanceof Error ? err.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Download all files for a specific middleware
 *
 * @param middlewareName - Name of the middleware to download
 * @param targetDir - Directory to save files in
 * @returns Promise with number of files downloaded
 * @example
 * const count = await downloadMiddleware('cors', './middleware');
 * console.log(`Downloaded ${count} files`);
 */
export async function downloadMiddleware(
    middlewareName: string,
    targetDir: string
): Promise<number> {
    try {
        // Get information about the middleware
        const info = await getMiddlewareInfo(middlewareName);

        // Create target directory if it doesn't exist
        await Bun.write(`${targetDir}/.gitkeep`, ''); // Creates dir

        let filesDownloaded = 0;

        // Download ALL files (including README.md)
        for (const fileName of info.files) {
            // Skip .gitkeep files - we don't need them
            if (fileName === '.gitkeep') {
                continue;
            }

            const sourcePath = `${info.path}/${fileName}`;
            const destPath = `${targetDir}/${fileName}`;

            await downloadFile(sourcePath, destPath);
            filesDownloaded++;
        }

        // Remove the .gitkeep file we created for the directory
        try {
            unlinkSync(`${targetDir}/.gitkeep`);
        } catch {
            // If .gitkeep doesn't exist or can't be deleted, ignore the error
        }

        return filesDownloaded;
    } catch (err) {
        throw new Error(
            `Failed to download middleware "${middlewareName}": ${
                err instanceof Error ? err.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Check if a middleware exists on GitHub
 * This is useful before trying to download something
 *
 * @param name - Name of the middleware to check
 * @returns Promise with true if it exists, false otherwise
 * @example
 * if (await middlewareExists('cors')) {
 *   await downloadMiddleware('cors', './middleware');
 * }
 */
export async function middlewareExists(name: string): Promise<boolean> {
    try {
        const response = await fetch(
            `${API_URL}/contents/ecosystem/middlewares/${name}`,
            {
                signal: createFetchSignal(),
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }
        );

        return response.ok;
    } catch {
        return false;
    }
}
