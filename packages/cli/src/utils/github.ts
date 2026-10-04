/** GitHub access via Bun's built-in fetch: lists and downloads ecosystem hooks, plugins, and skills. */

import type {
    GitHubFile,
    EcosystemComponentInfo,
    SkillInfo,
} from '../types/index';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
} from 'fs';
import { dirname, join } from 'path';
import { ecosystemCacheKey, withEcosystemCache } from './ecosystem-cache';
import { isLocalMode, requireLocalRepo } from './local-mode';
import { assertValidEcosystemName } from './names';

/** Repo config; override with BURGER_API_REPO_OWNER, BURGER_API_REPO_NAME, BURGER_API_BRANCH. */
const REPO_OWNER = process.env.BURGER_API_REPO_OWNER ?? 'isfhan';
const REPO_NAME = process.env.BURGER_API_REPO_NAME ?? 'burger-api';
/** Injected at build time when compiling to executable (--define CLI_VERSION). */
declare const CLI_VERSION: string | undefined;

/**
 * True when the installed CLI is a prerelease (`1.0.0-beta`, `-rc.1`, …).
 * Prereleases read ecosystem content from the 1.0 development branch until
 * stable 1.0 ships on `main`.
 */
export function isPrereleaseBuild(): boolean {
    let version = typeof CLI_VERSION !== 'undefined' ? CLI_VERSION : '';
    if (!version) {
        try {
            const pkgPath = join(import.meta.dir, '..', '..', 'package.json');
            version =
                (JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
                    version?: string;
                }).version ?? '';
        } catch {
            return false;
        }
    }
    return /-(?:beta|rc|alpha)(?:[.-]|$)/.test(version);
}

/** Ecosystem branch for prerelease CLIs (see {@link isPrereleaseBuild}). */
export const PRERELEASE_BRANCH = 'feat/burger-api-v1';

const BRANCH =
    process.env.BURGER_API_BRANCH ??
    (isPrereleaseBuild() ? PRERELEASE_BRANCH : 'main');

const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

/** Ecosystem cache key scoped to this repo + branch (see ecosystem-cache.ts). */
function ecosystemKey(name: string): string {
    return ecosystemCacheKey(name, {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        branch: BRANCH,
    });
}

// Contents API needs an explicit ref, or list/add/skills return empty results
// while the 1.0 branch has not merged to the default branch yet.
const contentsUrl = (path: string): string =>
    `${API_URL}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;

const FETCH_TIMEOUT_MS = 20_000;

/** Fetch with a timeout; always clears the timer so the CLI process can exit. */
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

/** GitHub API headers; GITHUB_TOKEN (when set) avoids the low anonymous rate limit. */
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
 * missing branch, ...) — never turn a failure into "not found".
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
            (response.status === 403 || response.status === 429
                ? ' GitHub API rate limit likely exceeded — set GITHUB_TOKEN to raise it, or retry later.'
                : '')
    );
}

export function wrapFetchError(err: unknown, fallbackMessage: string): Error {
    if (err instanceof Error && err.name === 'AbortError') {
        return new Error(
            'Request timed out. Please check your internet connection.'
        );
    }
    return new Error(err instanceof Error ? err.message : fallbackMessage);
}

/**
 * List ecosystem components (hooks and plugins) from GitHub.
 *
 * @returns Array of `{ name, kind }` entries
 * @throws Error if GitHub is unreachable or request fails
 * @example
 * const components = await getComponentList();
 * // [{ name: 'cors', kind: 'hook' }, { name: 'jwt-auth', kind: 'plugin' }, ...]
 */
export async function getComponentList(): Promise<
    Array<{ name: string; kind: 'hook' | 'plugin' }>
> {
    if (isLocalMode()) {
        const root = requireLocalRepo();
        const list = (
            ['hook', 'plugin'] as const
        ).flatMap((kind) => {
            const dir = localComponentDir(root, kind);
            if (!existsSync(dir)) return [];
            return readdirSync(dir, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => ({ name: entry.name, kind }));
        });
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }

    try {
        const [hooksRes, pluginsRes] = await Promise.all([
            fetchWithTimeout(contentsUrl('ecosystem/hooks'), {
                headers: githubHeaders(),
            }),
            fetchWithTimeout(contentsUrl('ecosystem/plugins'), {
                headers: githubHeaders(),
            }),
        ]);

        // Fail loud on HTTP errors instead of rendering an empty list.
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

/** Cached {@link getComponentList} — see `ecosystem-cache.ts` for the caching contract. */
export async function getCachedComponentList(): Promise<{
    data: Array<{ name: string; kind: 'hook' | 'plugin' }>;
    stale: boolean;
}> {
    // Local mode never reads or writes the ecosystem cache.
    if (isLocalMode()) {
        return { data: await getComponentList(), stale: false };
    }
    return withEcosystemCache(ecosystemKey('component-list'), getComponentList);
}

/** First non-heading, non-empty README line — the package's one-line description. */
function readmeDescription(readme: string): string {
    for (const line of readme.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) return trimmed;
    }
    return 'No description available';
}

/** `<repo>/ecosystem/hooks` or `<repo>/ecosystem/plugins`. */
function localComponentDir(root: string, kind: 'hook' | 'plugin'): string {
    return join(root, 'ecosystem', kind === 'plugin' ? 'plugins' : 'hooks');
}

/** Every file under `dir`, relative and `/`-separated; `.gitkeep` is skipped. */
function listRelativeFiles(dir: string, prefix = ''): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...listRelativeFiles(join(dir, entry.name), rel));
        } else if (entry.name !== '.gitkeep') {
            files.push(rel);
        }
    }
    return files;
}

/**
 * Copy `files` from `sourceDir` into `targetDir` through a staging dir, then
 * swap — the same partial-install guarantee downloads get.
 */
function copyFilesStaged(
    sourceDir: string,
    targetDir: string,
    files: string[]
): number {
    const stagingDir = `${targetDir}.download`;
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    try {
        for (const file of files) {
            const dest = join(stagingDir, file);
            mkdirSync(dirname(dest), { recursive: true });
            copyFileSync(join(sourceDir, file), dest);
        }

        rmSync(targetDir, { recursive: true, force: true });
        mkdirSync(dirname(targetDir), { recursive: true });
        renameSync(stagingDir, targetDir);
    } finally {
        rmSync(stagingDir, { recursive: true, force: true });
    }
    return files.length;
}

/** Attach README descriptions to a component list (local or GitHub). */
async function componentCatalog(
    list: Array<{ name: string; kind: 'hook' | 'plugin' }>,
    readReadme: (
        name: string,
        kind: 'hook' | 'plugin'
    ) => Promise<string>
): Promise<ComponentCatalogEntry[]> {
    return Promise.all(
        list.map(async ({ name, kind }) => {
            let description = 'No description available';
            try {
                description = readmeDescription(await readReadme(name, kind));
            } catch {
                // Description is cosmetic — keep the entry.
            }
            return { name, kind, description };
        })
    );
}

/** A catalog entry for `burger-api list`. */
export interface ComponentCatalogEntry {
    name: string;
    kind: 'hook' | 'plugin';
    description: string;
}

/** Component list plus each README's description, cached together so a warm `burger-api list` makes no network calls. */
export async function getCachedComponentCatalog(): Promise<{
    data: ComponentCatalogEntry[];
    stale: boolean;
}> {
    // Local mode never reads or writes the ecosystem cache.
    if (isLocalMode()) {
        const root = requireLocalRepo();
        const list = await getComponentList();
        return {
            data: await componentCatalog(list, async (name, kind) =>
                readFileSync(
                    join(localComponentDir(root, kind), name, 'README.md'),
                    'utf-8'
                )
            ),
            stale: false,
        };
    }

    return withEcosystemCache(ecosystemKey('component-catalog'), async () => {
        const list = await getComponentList();
        return componentCatalog(list, async (name, kind) => {
            const dir = kind === 'plugin' ? 'plugins' : 'hooks';
            const res = await fetchWithTimeout(
                `${RAW_URL}/ecosystem/${dir}/${name}/README.md`
            );
            if (!res.ok) throw new Error(`README for ${name} unavailable`);
            return res.text();
        });
    });
}

/**
 * Detailed info for one ecosystem component, including its README description.
 *
 * @param name - Name of the component (e.g., 'cors')
 * @param kind - Whether the component is a hook or a plugin
 * @returns Promise with component information
 */
export async function getComponentInfo(
    name: string,
    kind: 'hook' | 'plugin'
): Promise<EcosystemComponentInfo> {
    assertValidEcosystemName(name);
    const dir = kind === 'plugin' ? 'ecosystem/plugins' : 'ecosystem/hooks';
    if (isLocalMode()) {
        const componentDir = join(
            localComponentDir(requireLocalRepo(), kind),
            name
        );
        if (!existsSync(componentDir)) {
            throw new Error(`Component "${name}" not found`);
        }
        let description = 'No description available';
        try {
            description = readmeDescription(
                readFileSync(join(componentDir, 'README.md'), 'utf-8')
            );
        } catch {
            // README unreadable — keep the default description.
        }
        return {
            name,
            description,
            path: `${dir}/${name}`,
            files: readdirSync(componentDir, { withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => entry.name),
        };
    }
    try {
        const response = await fetchWithTimeout(
            contentsUrl(`${dir}/${name}`),
            {
                headers: {
                    ...githubHeaders(),
                },
            }
        );

        if (response.status === 404) {
            throw new Error(`Component "${name}" not found`);
        }
        // Rate limit (403/429), outage, … — say so instead of "not found".
        if (!response.ok) await throwForGitHubError(response);

        const files = (await response.json()) as GitHubFile[];

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

                const lines = readmeContent.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        description = trimmed;
                        break;
                    }
                }
            } catch {
                // README unreadable — keep the default description.
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
 * Download a file from GitHub.
 *
 * @param path - Path in the repo (e.g., 'ecosystem/hooks/cors/cors.ts')
 * @param destination - Where to save it locally
 * @throws Error if download fails
 */
export async function downloadFile(
    path: string,
    destination: string
): Promise<void> {
    try {
        const url = `${RAW_URL}/${path}`;

        const response = await fetchWithTimeout(url);

        if (!response.ok) {
            throw new Error(`Could not download ${path}`);
        }

        const content = await response.text();

        // Bun.write creates parent directories as needed.
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
 * Download all files for a specific ecosystem component.
 *
 * @param componentName - Name of the component to download
 * @param targetDir - Directory to save files in
 * @param kind - Whether the component is a hook or a plugin
 * @returns Promise with number of files downloaded
 */
export async function downloadComponent(
    componentName: string,
    targetDir: string,
    kind: 'hook' | 'plugin'
): Promise<number> {
    assertValidEcosystemName(componentName);
    if (isLocalMode()) {
        const sourceDir = join(
            localComponentDir(requireLocalRepo(), kind),
            componentName
        );
        if (!existsSync(sourceDir)) {
            throw new Error(
                `Failed to download component "${componentName}": ` +
                    `Component "${componentName}" not found`
            );
        }
        const files = readdirSync(sourceDir, { withFileTypes: true })
            .filter(
                (entry) => entry.isFile() && entry.name !== '.gitkeep'
            )
            .map((entry) => entry.name);
        return copyFilesStaged(sourceDir, targetDir, files);
    }

    try {
        const info = await getComponentInfo(componentName, kind);

        // Stage, then swap: a download that fails halfway never leaves a
        // partial directory behind (which the next `add` would report as
        // "already exists"). The target dir only appears once every file
        // landed, and replacing an existing install stays atomic-ish.
        const stagingDir = `${targetDir}.download`;
        rmSync(stagingDir, { recursive: true, force: true });
        mkdirSync(stagingDir, { recursive: true });

        let filesDownloaded = 0;
        try {
            // Download every file, README.md included.
            for (const fileName of info.files) {
                if (fileName === '.gitkeep') {
                    continue;
                }

                await downloadFile(
                    `${info.path}/${fileName}`,
                    `${stagingDir}/${fileName}`
                );
                filesDownloaded++;
            }

            rmSync(targetDir, { recursive: true, force: true });
            mkdirSync(dirname(targetDir), { recursive: true });
            renameSync(stagingDir, targetDir);
        } finally {
            rmSync(stagingDir, { recursive: true, force: true });
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
 *
 * @param name - Name of the hook to check
 * @returns Promise with true if it exists, false otherwise
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
 * Shared exists-check: 404 means absent; any other failure (rate limit,
 * network) throws so callers never report a false "not found".
 */
async function existsInEcosystem(
    kind: 'hooks' | 'plugins',
    name: string
): Promise<boolean> {
    assertValidEcosystemName(name);
    if (isLocalMode()) {
        return existsSync(join(requireLocalRepo(), 'ecosystem', kind, name));
    }

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
 * List available skills from GitHub (ecosystem/skills).
 *
 * @returns Array of skill names
 * @throws Error if GitHub is unreachable or request fails
 */
export async function getSkillList(): Promise<string[]> {
    if (isLocalMode()) {
        const dir = join(requireLocalRepo(), 'ecosystem', 'skills');
        if (!existsSync(dir)) return [];
        return readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }

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
    // Local mode never reads or writes the ecosystem cache.
    if (isLocalMode()) {
        return { data: await getSkillList(), stale: false };
    }
    return withEcosystemCache(ecosystemKey('skill-list'), getSkillList);
}

/**
 * Recursively flatten all files in a skill directory tree
 */
export async function flattenSkillFiles(
    basePath: string,
    prefix: string = ''
): Promise<string[]> {
    if (isLocalMode()) {
        const dir = join(requireLocalRepo(), basePath);
        return existsSync(dir) ? listRelativeFiles(dir, prefix) : [];
    }

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

/** Parse description and version from SKILL.md YAML frontmatter. */
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
    assertValidEcosystemName(name);
    if (isLocalMode()) {
        return existsSync(
            join(requireLocalRepo(), 'ecosystem', 'skills', name)
        );
    }

    try {
        const response = await fetchWithTimeout(
            contentsUrl(`ecosystem/skills/${name}`),
            {
                headers: {
                    ...githubHeaders(),
                },
            }
        );

        if (response.status === 404) return false;
        // Rate limit / outage: surface it instead of a false "not found".
        if (!response.ok) await throwForGitHubError(response);
        return true;
    } catch (err) {
        throw wrapFetchError(err, `Could not check skill "${name}"`);
    }
}

/**
 * Get detailed information about a specific skill
 *
 * @param name - Name of the skill (e.g., 'burger-api')
 * @returns Promise with skill info structure
 */
export async function getSkillInfo(name: string): Promise<SkillInfo> {
    assertValidEcosystemName(name);
    if (isLocalMode()) {
        const skillDir = join(
            requireLocalRepo(),
            'ecosystem',
            'skills',
            name
        );
        if (!existsSync(skillDir)) {
            throw new Error(`Skill "${name}" not found`);
        }
        let description = `AI agent skill for ${name}`;
        let version: string | undefined;
        try {
            const parsed = parseSkillDescription(
                readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
            );
            if (parsed.description !== '(no description)') {
                description = parsed.description;
            }
            version = parsed.version;
        } catch {
            // Keep the defaults.
        }
        return {
            name,
            description,
            version,
            path: `ecosystem/skills/${name}`,
            files: listRelativeFiles(skillDir),
        };
    }

    try {
        const response = await fetchWithTimeout(
            contentsUrl(`ecosystem/skills/${name}`),
            {
                headers: {
                    ...githubHeaders(),
                },
            }
        );

        if (response.status === 404) {
            throw new Error(`Skill "${name}" not found`);
        }
        // Rate limit (403/429), outage, … — say so instead of "not found".
        if (!response.ok) await throwForGitHubError(response);

        const entries = (await response.json()) as GitHubFile[];
        const flatFiles = await flattenSkillFiles(`ecosystem/skills/${name}`);

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
                // Keep the defaults.
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
    assertValidEcosystemName(skillName);
    if (isLocalMode()) {
        try {
            const sourceDir = join(
                requireLocalRepo(),
                'ecosystem',
                'skills',
                skillName
            );
            if (!existsSync(sourceDir)) {
                throw new Error(`Skill "${skillName}" not found`);
            }
            return copyFilesStaged(
                sourceDir,
                targetDir,
                listRelativeFiles(sourceDir)
            );
        } catch (err) {
            throw new Error(
                `Failed to download skill "${skillName}": ${
                    err instanceof Error ? err.message : 'Unknown error'
                }`
            );
        }
    }

    try {
        const info = await getSkillInfo(skillName);

        // Stage, then swap: an update leaves no stale files behind, and a
        // failed download never destroys the existing install.
        const stagingDir = `${targetDir}.download`;
        rmSync(stagingDir, { recursive: true, force: true });
        let filesDownloaded = 0;
        try {
            for (const fileName of info.files) {
                if (fileName === '.gitkeep') continue;
                await downloadFile(
                    `${info.path}/${fileName}`,
                    `${stagingDir}/${fileName}`
                );
                filesDownloaded++;
            }
            rmSync(targetDir, { recursive: true, force: true });
            mkdirSync(dirname(targetDir), { recursive: true });
            renameSync(stagingDir, targetDir);
        } finally {
            rmSync(stagingDir, { recursive: true, force: true });
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
