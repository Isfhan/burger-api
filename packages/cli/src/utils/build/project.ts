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

/** Entry files the CLI looks for when `-f`/`<file>` is not given. */
export const DEFAULT_ENTRY_FILES = [
    'src/index.ts',
    'src/index.js',
    'src/index.mjs',
] as const;

/**
 * Resolve the app entry file: an explicit value wins, otherwise the first
 * existing `src/index.ts|js|mjs` (JS projects work without `-f`). Falls back
 * to `src/index.ts` so "not found" errors name the conventional path.
 */
export function resolveEntryFile(
    explicit: string | undefined,
    cwd: string = process.cwd()
): string {
    if (explicit) return explicit;
    return (
        DEFAULT_ENTRY_FILES.find((f) => existsSync(join(cwd, f))) ??
        'src/index.ts'
    );
}

/**
 * Validate a `--port` value (integer 1-65535). Returns the normalized
 * string, or an error message.
 */
export function validatePort(raw: string): { port: string } | { error: string } {
    const trimmed = raw.trim();
    const n = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || !Number.isInteger(n) || n < 1 || n > 65535) {
        return {
            error: `Invalid port "${raw}" — use an integer between 1 and 65535.`,
        };
    }
    return { port: String(n) };
}

/**
 * Why `cwd` is not a BurgerAPI project, or undefined when it is: needs a
 * package.json that lists `burger-api` (dependencies or devDependencies).
 */
export function projectError(cwd: string = process.cwd()): string | undefined {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) {
        return 'Not in a BurgerAPI project directory (no package.json found).';
    }
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        if (
            pkg.dependencies?.['burger-api'] ||
            pkg.devDependencies?.['burger-api']
        ) {
            return undefined;
        }
        return 'Not in a BurgerAPI project directory (package.json does not list "burger-api").';
    } catch {
        return 'Not in a BurgerAPI project directory (package.json could not be parsed).';
    }
}

/** Hint printed under {@link projectError} by inspect/doctor/generate. */
export const PROJECT_HINT =
    'Run this from your project root, or create a project with: burger-api create <name>';
