/**
 * WebSocket directory scanner
 * Scans the WebSocket directory for ws.ts / ws.js / ws.mjs files
 */

import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { resolveScanDir } from '../utils/fs';
import {
    splitConventionName,
    type ConventionFile,
} from '../compiler/conventions';

/** WebSocket convention stems (extension is `.ts` / `.js` / `.mjs`). */
const WS_CONVENTION_FILES = ['ws', 'hooks', 'config'] as const;

/**
 * Scanned WebSocket route
 */
export interface ScannedWebSocketRoute {
    /**
     * Route path (e.g., "/chat", "/notifications/:room")
     */
    path: string;

    /**
     * Absolute path to ws.ts / ws.js / ws.mjs file
     */
    wsFile: string;

    /**
     * Absolute path to hooks file (if any)
     */
    hooksFile?: string;

    /**
     * Absolute path to config file (if any)
     */
    configFile?: string;

    /**
     * Route parameters
     */
    params?: Record<string, string>;

    /**
     * Whether this is a wildcard route
     */
    isWildcard?: boolean;

    /**
     * Whether this is a group directory (URL only, no inheritance)
     */
    isGroup?: boolean;

    /**
     * Group name (if isGroup)
     */
    groupName?: string;
}

/**
 * WebSocket scan result
 */
export interface WebSocketScanResult {
    /**
     * Scanned WebSocket routes
     */
    routes: ScannedWebSocketRoute[];

    /**
     * Global hooks file path (if any)
     */
    globalHooks?: string;
}

/**
 * WebSocket directory scanner
 */
export class WebSocketScanner {
    constructor(
        private readonly wsDir: string,
        private readonly prefix: string = ''
    ) {
        if (!wsDir) {
            throw new Error('WebSocket directory path is required');
        }
        this.wsDir = resolveScanDir(wsDir, 'WebSocket', 'wsDir');
    }

    /**
     * Scans the WebSocket directory tree and returns scanned routes
     */
    async scan(): Promise<WebSocketScanResult> {
        const routes: ScannedWebSocketRoute[] = [];
        await this.walk(this.wsDir, routes);

        // Detect global hooks at the parent directory
        let globalHooks: string | undefined;
        const parentDir = path.dirname(this.wsDir);
        let rootEntries: { name: string; isFile: () => boolean }[] = [];
        try {
            rootEntries = await readdir(parentDir, {
                withFileTypes: true,
            });
        } catch {
            // Parent directory may not exist
        }
        for (const entry of rootEntries) {
            if (!entry.isFile()) continue;
            const split = splitConventionName(entry.name);
            if (!split || split.stem !== 'hooks') continue;
            if (globalHooks) {
                throw new Error(
                    `Conflicting app-level hooks files "${globalHooks}" and "${path.join(parentDir, entry.name)}" — ` +
                        `use only one of .ts/.js/.mjs.`
                );
            }
            globalHooks = path.resolve(path.join(parentDir, entry.name));
        }

        return { routes, globalHooks };
    }

    /**
     * Recursively walks the directory and emits ScannedWebSocketRoute
     * when a ws.ts file is found.
     */
    private async walk(
        dir: string,
        out: ScannedWebSocketRoute[]
    ): Promise<void> {
        let dynamicFolderFound = false;
        let wildcardFolderFound = false;

        const entries = await readdir(dir, { withFileTypes: true });
        const subDirs: string[] = [];

        // Collect ws / hooks / config files across all accepted extensions.
        const wsFiles: Map<string, string> = new Map();
        for (const entry of entries) {
            if (entry.isDirectory()) {
                subDirs.push(entry.name);
                continue;
            }
            if (!entry.isFile()) continue;
            const split = splitConventionName(entry.name);
            if (
                !split ||
                !(WS_CONVENTION_FILES as readonly string[]).includes(
                    split.stem
                )
            ) {
                continue;
            }
            const abs = path.resolve(path.join(dir, entry.name));
            const existing = wsFiles.get(split.stem);
            if (existing) {
                throw new Error(
                    `Conflicting convention files "${existing}" and "${abs}" in "${dir}" — ` +
                        `use only one of .ts/.js/.mjs per convention file.`
                );
            }
            wsFiles.set(split.stem, abs);
        }

        const wsFile = wsFiles.get('ws');
        if (wsFile) {
            const dirName = path.basename(dir);
            const hooksFile = wsFiles.get('hooks');
            const configFile = wsFiles.get('config');

            // Build route path
            const routePath = this.buildRoutePath(dir);
            const params = this.extractParams(routePath);
            const isWildcard = this.isWildcardDir(dirName);
            const isGroup = this.isGroupDir(dirName);
            const groupName = isGroup
                ? this.extractGroupName(dirName)
                : undefined;

            out.push({
                path: routePath,
                wsFile,
                hooksFile,
                configFile,
                params,
                isWildcard,
                isGroup,
                groupName,
            });
        }

        // Process subdirectories
        for (const subDir of subDirs) {
            // Skip group directories (they only affect URL)
            // but still recurse into them
            await this.walk(path.join(dir, subDir), out);
        }
    }

    /**
     * Builds the route path from the directory structure
     */
    private buildRoutePath(dir: string): string {
        const relativePath = path.relative(this.wsDir, dir);
        const parts = relativePath.split(path.sep);

        // Convert directory names to route path
        const routeParts: string[] = [];
        for (const part of parts) {
            // Skip group directories in URL
            if (this.isGroupDir(part)) continue;

            // Convert dynamic folders
            if (this.isWildcardDir(part)) {
                routeParts.push('*');
                continue;
            }

            if (this.isDynamicDir(part)) {
                const paramName = this.extractParamName(part);
                routeParts.push(`:${paramName}`);
                continue;
            }

            routeParts.push(part);
        }

        // Build final path with prefix
        const routePath = '/' + routeParts.join('/');
        return this.prefix
            ? `/${this.prefix}${routePath}`.replace(/\/+/g, '/')
            : routePath;
    }

    /**
     * Extracts route parameters from the path
     */
    private extractParams(
        routePath: string
    ): Record<string, string> | undefined {
        const params: Record<string, string> = {};
        const parts = routePath.split('/');
        let hasParams = false;

        for (const part of parts) {
            if (part.startsWith(':')) {
                const paramName = part.slice(1);
                params[paramName] = paramName;
                hasParams = true;
            }
        }

        return hasParams ? params : undefined;
    }

    /**
     * Checks if a directory name is a dynamic parameter folder
     */
    private isDynamicDir(name: string): boolean {
        return /^\[([^\]]+)\]$/.test(name);
    }

    /**
     * Extracts the parameter name from a dynamic folder
     */
    private extractParamName(name: string): string {
        const match = name.match(/^\[([^\]]+)\]$/);
        return match ? match[1] : name;
    }

    /**
     * Checks if a directory name is a wildcard folder
     */
    private isWildcardDir(name: string): boolean {
        return /^\[\.\.\.([^\]]*)\]$/.test(name);
    }

    /**
     * Checks if a directory name is a group folder
     */
    private isGroupDir(name: string): boolean {
        return /^\(.+\)$/.test(name);
    }

    /**
     * Extracts the group name from a group folder
     */
    private extractGroupName(name: string): string {
        const match = name.match(/^\((.+)\)$/);
        return match ? (match[1] ?? name) : name;
    }
}
