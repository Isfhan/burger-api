import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Read the project name from package.json.
 * Falls back to 'app' if not found or on any error.
 */
export function getProjectName(cwd: string = process.cwd()): string {
    try {
        const packageJsonPath = join(cwd, 'package.json');
        if (existsSync(packageJsonPath)) {
            const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
                name?: string;
            };
            return pkg?.name || 'app';
        }
    } catch {
        // Ignore — use fallback
    }
    return 'app';
}
