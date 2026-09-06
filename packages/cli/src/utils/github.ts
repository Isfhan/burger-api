/**
 * GitHub Integration
 *
 * Downloads files from GitHub using Bun's built-in fetch.
 * No extra packages needed - we use the native fetch API that comes with Bun!
 *
 * This module handles all communication with GitHub to:
 * - Get lists of available hooks and plugins
 * - Download template files
 * - Download ecosystem component code
 */

import type {
    GitHubFile,
    EcosystemComponentInfo,
    SkillInfo,
} from '../types/index';
import { unlinkSync } from 'fs';
import { withEcosystemCache } from './ecosystem-cache';

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

// Contents API needs an explicit ref; the default branch is stale until
// feat/burger-api-v1 merges, so list/add/skills would return empty results.
const contentsUrl = (path: string): string =>
    `${API_URL}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;

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

/**
 * Headers for GitHub API requests. Uses GITHUB_TOKEN (if set) for
 * authenticated requests — unauthenticated requests share a low rate limit.
 */
function githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'burger-api-cli',
    };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

/**
 * Throw a descriptive error for a non-OK GitHub response (rate limit,
 * missing branch, ...). Never swallow these — silent empty results made
 * failures look like "not found".
 */
async function throwForGitHubError(response: Response): Promise<never> {
    let detail = '';
    try {
        const body = (await response.json()) as { message?: string };
        if (body?.message) detail = ` — ${body.message}`;
    } catch {
        // Non-JSON error body — fall back to the bare status.
    }
    throw new Error(
        `GitHub request failed (HTTP ${response.status}${detail}).` +
            (response.status === 403
                ? ' Set GITHUB_TOKEN to raise the rate limit.'
                : '')
    );
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
 * Get the list of available ecosystem components from GitHub.
 * This scans the ecosystem/hooks and ecosystem/plugins folders.
 *
 * @returns Promise with array of `{ name, kind }` entries
 * @throws Error if GitHub is unreachable or request fails
 * @example
 * const components = await getComponentList();
 * // [{ name: 'cors', kind: 'hook' }, { name: 'jwt-auth', kind: 'plugin' }, ...]
 */
export async function getComponentList(): Promise<
    Array<{ name: string; kind: 'hook' | 'plugin' }>
> {
    try {
        // Fetch both hooks and plugins from ecosystem
        const [hooksRes, pluginsRes] = await Promise.all([
            fetchWithTimeout(contentsUrl('ecosystem/hooks'), {
                headers: githubHeaders(),
            }),
            fetchWithTimeout(contentsUrl('ecosystem/plugins'), {
                headers: githubHeaders(),
            }),
        ]);

        // Fail loud on HTTP errors (403 rate limit, 404 branch, ...) instead
        // of silently rendering an empty list.
        if (!hooksRes.ok) await throwForGitHubError(hooksRes);
        if (!pluginsRes.ok) await throwForGitHubError(pluginsRes);

        const hooks = ((await hooksRes.json()) as GitHubFile[])
            .filter((f) => f.type === 'dir')
            .map((f) => ({ name: f.name, kind: 'hook' as const }));
        const plugins = ((await pluginsRes.json()) as GitHubFile[])
            .filter((f) => f.type === 'dir')
            .map((f) => ({ name: f.name, kind: 'plugin' as const }));

        return [...hooks, ...plugins].sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    } catch (err) {
        throw wrapFetchError(
            err,
            'Could not get the ecosystem list from GitHub. Please check your internet connection.'
        );
    }
}

/**
 * Cached wrapper around {@link getComponentList} — see `ecosystem-cache.ts`
 * for the caching contract (fresh: served from disk; stale: refreshed,
 * falling back to the stale copy on a failed refresh; cold + failing
 * fetch: throws, same as the uncached function).
 */
export async function getCachedComponentList(): Promise<{
    data: Array<{ name: string; kind: 'hook' | 'plugin' }>;
    stale: boolean;
}> {
    return withEcosystemCache('component-list', getComponentList);
}

/**
 * Get detailed information about a specific ecosystem component.
 * This reads the README file to get the description.
 *
 * @param name - Name of the component (e.g., 'cors')
 * @param kind - Whether the component is a hook or a plugin
 * @returns Promise with component information
 * @example
 * const info = await getComponentInfo('cors', 'hook');
 * console.log(info.description);
 */
export async function getComponentInfo(
    name: string,
    kind: 'hook' | 'plugin'
): Promise<EcosystemComponentInfo> {
    const dir = kind === 'plugin' ? 'ecosystem/plugins' : 'ecosystem/hooks';
    try {
        // Get list of files in the component directory
        const response = await fetchWithTimeout(
            contentsUrl(`${dir}/${name}`),
            {
                headers: {
                    ...githubHeaders(),
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Component "${name}" not found`);
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
            path: `${dir}/${name}`,
            files: files.map((f) => f.name),
        };
    } catch (err) {
        throw wrapFetchError(
            err,
            `Could not get info for component "${name}"`
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
 * await downloadFile('ecosystem/hooks/cors/cors.ts', './ecosystem/hooks/cors/cors.ts');
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
 * Download all files for a specific ecosystem component
 *
 * @param componentName - Name of the component to download
 * @param targetDir - Directory to save files in
 * @param kind - Whether the component is a hook or a plugin
 * @returns Promise with number of files downloaded
 * @example
 * const count = await downloadComponent('cors', './ecosystem/hooks/cors', 'hook');
 * console.log(`Downloaded ${count} files`);
 */
export async function downloadComponent(
    componentName: string,
    targetDir: string,
    kind: 'hook' | 'plugin'
): Promise<number> {
    try {
        // Get information about the component
        const info = await getComponentInfo(componentName, kind);

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
            `Failed to download component "${componentName}": ${
                err instanceof Error ? err.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Check if a hook exists on GitHub under ecosystem/hooks/.
 * This is useful before trying to download something
 *
 * @param name - Name of the hook to check
 * @returns Promise with true if it exists, false otherwise
 * @example
 * if (await hookExists('cors')) {
 * await downloadComponent('cors', './ecosystem/hooks/cors', 'hook');
 * }
 */
export async function hookExists(name: string): Promise<boolean> {
    return existsInEcosystem('hooks', name);
}

/**
 * Check if a plugin exists on GitHub under ecosystem/plugins/.
 */
export async function pluginExists(name: string): Promise<boolean> {
    return existsInEcosystem('plugins', name);
}

/**
 * Shared exists-check: 404 means genuinely absent; any other failure
 * (rate limit, network) throws so callers never report a false "not found".
 */
async function existsInEcosystem(
    kind: 'hooks' | 'plugins',
    name: string
): Promise<boolean> {
    let response: Response;
    try {
        response = await fetchWithTimeout(
            contentsUrl(`ecosystem/${kind}/${name}`),
            {
                headers: githubHeaders(),
            }
        );
    } catch (err) {
        throw wrapFetchError(
            err,
            'Could not reach GitHub. Please check your internet connection.'
        );
    }
    if (response.status === 404) return false;
    if (!response.ok) await throwForGitHubError(response);
    return true;
}

/**
 * Detect whether a package is a hook or plugin on GitHub.
 * Returns 'hook' | 'plugin' | null.
 */
export async function detectEcosystemType(
    name: string
): Promise<'hook' | 'plugin' | null> {
    if (await hookExists(name)) return 'hook';
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
    let response: Response;
    try {
        response = await fetchWithTimeout(contentsUrl('ecosystem/skills'), {
            headers: githubHeaders(),
        });
    } catch (err) {
        throw wrapFetchError(
            err,
            'Could not get skill list from GitHub. Please check your internet connection.'
        );
    }

    if (!response.ok) await throwForGitHubError(response);

    const files = (await response.json()) as GitHubFile[];

    return files
        .filter((f) => f.type === 'dir')
        .map((f) => f.name)
        .sort();
}

/**
 * Cached wrapper around {@link getSkillList} — see {@link getCachedComponentList}.
 */
export async function getCachedSkillList(): Promise<{
    data: string[];
    stale: boolean;
}> {
    return withEcosystemCache('skill-list', getSkillList);
}

/**
 * Recursively flatten all files in a skill directory tree
 */
export async function flattenSkillFiles(
    basePath: string,
    prefix: string = ''
): Promise<string[]> {
    const response = await fetchWithTimeout(contentsUrl(basePath), {
        headers: {
            ...githubHeaders(),
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
            contentsUrl(`ecosystem/skills/${name}`),
            {
                headers: {
                    ...githubHeaders(),
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
            contentsUrl(`ecosystem/skills/${name}`),
            {
                headers: {
                    ...githubHeaders(),
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
