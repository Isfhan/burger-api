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

import type { GitHubFile, MiddlewareInfo, SkillInfo } from '../types/index';
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

/**
 * Fetch with a timeout. Always clears the timer when the request settles so
 * the CLI process can exit (orphaned timers were keeping the event loop alive
 * after successful responses).
 */
async function fetchWithTimeout(
    input: string | URL | Request,
    init?: RequestInit
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
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
 * This scans the ecosystem/hooks folder and returns what's available
 *
 * @returns Promise with array of middleware names
 * @throws Error if GitHub is unreachable or request fails
 * @example
 * const middleware = await getMiddlewareList();
 * // ['cors', 'logger', 'rate-limiter', ...]
 */
export async function getMiddlewareList(): Promise<string[]> {
    try {
        // Fetch both hooks and plugins from ecosystem
        const [hooksRes, pluginsRes] = await Promise.all([
            fetchWithTimeout(`${API_URL}/contents/ecosystem/hooks`, {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }),
            fetchWithTimeout(`${API_URL}/contents/ecosystem/plugins`, {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }),
        ]);

        const hooks = hooksRes.ok
            ? ((await hooksRes.json()) as GitHubFile[])
                  .filter((f) => f.type === 'dir')
                  .map((f) => f.name)
            : [];
        const plugins = pluginsRes.ok
            ? ((await pluginsRes.json()) as GitHubFile[])
                  .filter((f) => f.type === 'dir')
                  .map((f) => f.name)
            : [];

        return [...hooks, ...plugins].sort();
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
        const response = await fetchWithTimeout(
            `${API_URL}/contents/ecosystem/hooks/${name}`,
            {
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
                const readmeResponse = await fetchWithTimeout(
                    readmeFile.download_url
                );
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
            path: `ecosystem/hooks/${name}`,
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
 * @param path - Path in the repo (e.g., 'ecosystem/hooks/cors/cors.ts')
 * @param destination - Where to save it on your computer
 * @returns Promise that resolves when download is complete
 * @throws Error if download fails
 * @example
 * await downloadFile('ecosystem/hooks/cors/cors.ts', './middleware/cors.ts');
 */
export async function downloadFile(
    path: string,
    destination: string
): Promise<void> {
    try {
        // Build the URL to the raw file content
        const url = `${RAW_URL}/${path}`;

        const response = await fetchWithTimeout(url);

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
 * await downloadMiddleware('cors', './middleware');
 * }
 */
export async function middlewareExists(name: string): Promise<boolean> {
    try {
        const response = await fetchWithTimeout(
            `${API_URL}/contents/ecosystem/hooks/${name}`,
            {
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

/**
 * Check if a plugin exists on GitHub under ecosystem/plugins/.
 */
export async function pluginExists(name: string): Promise<boolean> {
    try {
        const response = await fetchWithTimeout(
            `${API_URL}/contents/ecosystem/plugins/${name}`,
            {
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

/**
 * Detect whether a package is a hook or plugin on GitHub.
 * Returns 'hook' | 'plugin' | null.
 */
export async function detectEcosystemType(
    name: string
): Promise<'hook' | 'plugin' | null> {
    if (await middlewareExists(name)) return 'hook';
    if (await pluginExists(name)) return 'plugin';
    return null;
}

/**
 * Get list of available skills from GitHub
 * This scans the ecosystem/skills folder and returns what's available
 *
 * @returns Promise with array of skill names
 * @throws Error if GitHub is unreachable or request fails
 */
export async function getSkillList(): Promise<string[]> {
    try {
        const response = await fetchWithTimeout(
            `${API_URL}/contents/ecosystem/skills`,
            {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`GitHub returned status ${response.status}`);
        }

        const files = (await response.json()) as GitHubFile[];

        return files
            .filter((f) => f.type === 'dir')
            .map((f) => f.name)
            .sort();
    } catch (err) {
        throw wrapFetchError(
            err,
            'Could not get skill list from GitHub. Please check your internet connection.'
        );
    }
}

/**
 * Recursively flatten all files in a skill directory tree
 */
export async function flattenSkillFiles(
    basePath: string,
    prefix: string = ''
): Promise<string[]> {
    const response = await fetchWithTimeout(`${API_URL}/contents/${basePath}`, {
        headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'burger-api-cli',
        },
    });

    if (!response.ok) return [];

    const entries = (await response.json()) as GitHubFile[];
    const files: string[] = [];

    for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.type === 'file') {
            files.push(relativePath);
        } else if (entry.type === 'dir') {
            const nested = await flattenSkillFiles(
                `ecosystem/skills/${basePath.replace('ecosystem/skills/', '')}/${entry.name}`,
                relativePath
            );
            files.push(...nested);
        }
    }

    return files;
}

/**
 * Parse a description line from SKILL.md YAML frontmatter.
 * Extracted as a separate function for testability.
 */
export function parseSkillDescription(raw: string): {
    description: string;
    version?: string;
} {
    const descLine = raw.split('\n').find((l) => l.startsWith('description:'));
    const verLine = raw.split('\n').find((l) => l.startsWith('version:'));
    const description = descLine
        ? descLine
              .slice('description:'.length)
              .trim()
              .replace(/^['"]|['"]$/g, '')
        : '(no description)';
    const version = verLine
        ? verLine
              .slice('version:'.length)
              .trim()
              .replace(/^['"]|['"]$/g, '')
        : undefined;
    return { description, version };
}

/**
 * Check if a skill exists on GitHub
 *
 * @param name - Name of the skill to check (e.g., 'burger-api')
 * @returns Promise with true if it exists, false otherwise
 */
export async function skillExists(name: string): Promise<boolean> {
    try {
        const response = await fetchWithTimeout(
            `${API_URL}/contents/ecosystem/skills/${name}`,
            {
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

/**
 * Get detailed information about a specific skill
 *
 * @param name - Name of the skill (e.g., 'burger-api')
 * @returns Promise with skill info structure
 */
export async function getSkillInfo(name: string): Promise<SkillInfo> {
    try {
        const response = await fetchWithTimeout(
            `${API_URL}/contents/ecosystem/skills/${name}`,
            {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'burger-api-cli',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Skill "${name}" not found`);
        }

        const entries = (await response.json()) as GitHubFile[];
        const flatFiles = await flattenSkillFiles(`ecosystem/skills/${name}`);

        // Try to parse description and version from SKILL.md frontmatter
        const skillMd = entries.find((f) => f.name === 'SKILL.md');
        let description = `AI agent skill for ${name}`;
        let version: string | undefined;

        if (skillMd?.download_url) {
            try {
                const raw = await (
                    await fetchWithTimeout(skillMd.download_url)
                ).text();
                const parsed = parseSkillDescription(raw);
                if (parsed.description !== '(no description)') {
                    description = parsed.description;
                }
                version = parsed.version;
            } catch {
                // fall back to defaults
            }
        }

        return {
            name,
            description,
            version,
            path: `ecosystem/skills/${name}`,
            files: flatFiles,
        };
    } catch (err) {
        throw wrapFetchError(err, `Could not get info for skill "${name}"`);
    }
}

/**
 * Download all files for a specific skill
 *
 * @param skillName - Name of the skill to download
 * @param targetDir - Directory to save files in
 * @returns Promise with number of files downloaded
 */
export async function downloadSkill(
    skillName: string,
    targetDir: string
): Promise<number> {
    try {
        const info = await getSkillInfo(skillName);

        // Create target directory
        await Bun.write(`${targetDir}/.gitkeep`, '');

        let filesDownloaded = 0;
        for (const fileName of info.files) {
            if (fileName === '.gitkeep') continue;
            const sourcePath = `${info.path}/${fileName}`;
            const destPath = `${targetDir}/${fileName}`;
            // Ensure parent directory exists
            const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
            await Bun.write(`${parentDir}/.gitkeep`, '');
            await downloadFile(sourcePath, destPath);
            filesDownloaded++;
        }

        // Remove .gitkeep
        try {
            unlinkSync(`${targetDir}/.gitkeep`);
        } catch {
            /* ignore */
        }

        return filesDownloaded;
    } catch (err) {
        throw new Error(
            `Failed to download skill "${skillName}": ${
                err instanceof Error ? err.message : 'Unknown error'
            }`
        );
    }
}
