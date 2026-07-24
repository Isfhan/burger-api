/**
 * Shared TypeScript types for the CLI
 *
 * These types are used across different parts of the CLI
 * to ensure type safety and good developer experience.
 */

/**
 * Options for creating a new Burger API project
 */
export interface CreateOptions {
    /** Name of the project */
    name: string;
    /** Whether to include API routes */
    useApi: boolean;
    /** Directory for API routes (e.g., 'api') */
    apiDir?: string;
    /** Prefix for API routes (e.g., '/api') */
    apiPrefix?: string;
    /** Enable debug mode */
    debug?: boolean;
    /** Whether to include Page routes */
    usePages: boolean;
    /** Directory for Page routes (e.g., 'pages') */
    pageDir?: string;
    /** Prefix for Page routes (e.g., '/') */
    pagePrefix?: string;
    /** Whether to add AI agent skills */
    addSkills?: boolean;
}

/**
 * Information about a middleware/feature from GitHub
 */
export interface MiddlewareInfo {
    /** Name of the middleware (e.g., 'cors') */
    name: string;
    /** Short description of what it does */
    description: string;
    /** Path in the GitHub repo */
    path: string;
    /** Files that are part of this middleware */
    files: string[];
}

/**
 * Information about a skill from GitHub
 */
export interface SkillInfo {
    /** Name of the skill (e.g., 'burger-api') */
    name: string;
    /** Short description from frontmatter */
    description: string;
    /** Version from frontmatter, if present */
    version?: string;
    /** Path in the GitHub repo */
    path: string;
    /** Files that are part of this skill */
    files: string[];
}

/**
 * GitHub API response for directory contents
 */
export interface GitHubFile {
    name: string;
    path: string;
    type: 'file' | 'dir';
    download_url?: string;
    size: number;
}

/**
 * Build-time configuration for Burger API (conventions or burger.build.ts).
 * Used by the CLI when generating the virtual entry and scanning routes.
 */
export interface BuildConfig {
    apiDir: string;
    pageDir: string;
    apiPrefix: string;
    pagePrefix: string;
    debug?: boolean;
}
