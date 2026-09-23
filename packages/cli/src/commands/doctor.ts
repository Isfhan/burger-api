/**
 * Doctor Command
 *
 * Validates project structure and detects issues.
 *
 * Example: burger-api doctor
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveBuildConfig } from '../utils/config';
import { scanApiRoutes, ensureAppDirEnv } from '../utils/scanner';
import {
    success,
    error as logError,
    info,
    newline,
    bullet,
    header,
    highlight,
    warning,
} from '../utils/logger';

export interface CheckResult {
    name: string;
    pass: boolean;
    message: string;
}

function check(name: string, pass: boolean, message: string): CheckResult {
    return { name, pass, message };
}

/** Finds the first existing file among `${cwd}/${base}${ext}` for each ext. */
function findExisting(
    cwd: string,
    base: string,
    exts: readonly string[]
): string | undefined {
    return exts.find((ext) => existsSync(join(cwd, `${base}${ext}`)));
}

export async function runChecks(cwd: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 1. package.json
    results.push(
        check(
            'package.json',
            existsSync(join(cwd, 'package.json')),
            existsSync(join(cwd, 'package.json'))
                ? 'Found'
                : 'Not found — run this from a BurgerAPI project directory'
        )
    );

    // 2. burger-api installed
    try {
        const pkg = JSON.parse(
            readFileSync(join(cwd, 'package.json'), 'utf-8')
        );
        const depVersion =
            pkg.dependencies?.['burger-api'] ??
            pkg.devDependencies?.['burger-api'];
        results.push(
            check(
                'burger-api installed',
                !!depVersion,
                depVersion
                    ? `Found (${depVersion})`
                    : 'Not found in dependencies'
            )
        );
    } catch {
        results.push(
            check('burger-api installed', false, 'Could not read package.json')
        );
    }

    // 3. burger.build.ts
    const hasBuildConfig = [
        'burger.build.ts',
        'burger.build.js',
        'burger.config.ts',
        'burger.config.js',
    ].some((name) => existsSync(join(cwd, name)));
    results.push(
        check(
            'burger.build.ts',
            true, // convention defaults apply — not an error
            hasBuildConfig ? 'Found' : 'Not found (using convention defaults)'
        )
    );

    // 4. src/index.(ts|js|mjs)
    const indexExt = findExisting(join(cwd, 'src'), 'index', [
        '.ts',
        '.js',
        '.mjs',
    ]);
    results.push(
        check(
            'src/index.ts',
            !!indexExt,
            indexExt ? `Found (index${indexExt})` : 'Not found'
        )
    );

    // 5. src/api/
    const hasApiDir = existsSync(join(cwd, 'src', 'api'));
    results.push(
        check('src/api/', hasApiDir, hasApiDir ? 'Found' : 'Not found')
    );

    // 6. Route files
    if (hasApiDir) {
        const config = await resolveBuildConfig(cwd);
        ensureAppDirEnv();
        let routes: Awaited<ReturnType<typeof scanApiRoutes>> = [];
        try {
            routes = await scanApiRoutes(
                cwd,
                config.apiDir,
                config.apiPrefix
            );
        } catch {
            // Unresolvable custom apiDir — report as a failed check, not a crash.
        }
        results.push(
            check(
                'route.ts files',
                routes.length > 0,
                routes.length > 0
                    ? `${routes.length} route(s) discovered`
                    : 'No route.ts files found in src/api/'
            )
        );
    }

    // 7. tsconfig.json (or jsconfig.json for JavaScript projects)
    const hasTsconfig = existsSync(join(cwd, 'tsconfig.json'));
    const hasJsconfig = existsSync(join(cwd, 'jsconfig.json'));
    results.push(
        check(
            'tsconfig.json',
            hasTsconfig || hasJsconfig,
            hasTsconfig
                ? 'Found'
                : hasJsconfig
                  ? 'Found (jsconfig.json)'
                  : 'Not found'
        )
    );

    // 8. Legacy config warning
    const hasLegacyConfig =
        existsSync(join(cwd, 'burger.config.ts')) ||
        existsSync(join(cwd, 'burger.config.js'));
    if (hasLegacyConfig) {
        results.push(
            check(
                'No legacy config',
                false,
                'burger.config.ts found — rename to burger.build.ts'
            )
        );
    }

    // 9. Optional files (info only)
    const CONVENTION_EXTS = ['.ts', '.js', '.mjs'] as const;
    const hooksExt = findExisting(join(cwd, 'src'), 'hooks', CONVENTION_EXTS);
    results.push(
        check(
            'src/hooks.ts',
            true,
            hooksExt ? `Found (hooks${hooksExt})` : 'Not found (optional)'
        )
    );

    const pluginsExt = findExisting(
        join(cwd, 'src'),
        'plugins',
        CONVENTION_EXTS
    );
    results.push(
        check(
            'src/plugins.ts',
            true,
            pluginsExt ? `Found (plugins${pluginsExt})` : 'Not found (optional)'
        )
    );

    const openapiConfigExt = findExisting(
        join(cwd, 'src'),
        'openapi.config',
        CONVENTION_EXTS
    );
    results.push(
        check(
            'src/openapi.config.ts',
            true,
            openapiConfigExt
                ? `Found (openapi.config${openapiConfigExt})`
                : 'Not found (optional)'
        )
    );

    return results;
}

/**
 * Structured, machine-readable doctor result — same checks the formatted
 * console output presents, serialized instead of printed. A real, versioned
 * type (not an ad-hoc object literal) for the same reason as
 * `InspectResult`: a CLI meant for AI-agent/tooling consumption needs a
 * documented contract, not an implicit shape.
 */
export interface DoctorResult {
    /** Schema version for this JSON shape — bump on any breaking field change. */
    version: 1;
    ok: boolean;
    errorCount: number;
    checks: CheckResult[];
}

export const doctorCommand = new Command('doctor')
    .description('Validate project structure and detect issues')
    .option(
        '--json',
        'Output a structured JSON result instead of formatted text (for tooling/agents)'
    )
    .action(async (options: { json?: boolean }) => {
        if (!existsSync('package.json')) {
            if (options.json) {
                console.log(
                    JSON.stringify({
                        error: 'Not in a BurgerAPI project directory.',
                    })
                );
            } else {
                logError('Not in a BurgerAPI project directory.');
                info('Run this from your project root.');
            }
            process.exit(1);
        }

        const cwd = process.cwd();
        const results = await runChecks(cwd);
        const errorCount = results.filter((r) => !r.pass).length;

        if (options.json) {
            const result: DoctorResult = {
                version: 1,
                ok: errorCount === 0,
                errorCount,
                checks: results,
            };
            console.log(JSON.stringify(result, null, 2));
            process.exit(errorCount > 0 ? 1 : 0);
        }

        newline();
        header('BurgerAPI Doctor');
        newline();

        for (const result of results) {
            if (result.pass) {
                success(`✓ ${result.name}`);
                if (result.message !== 'Found') {
                    info(` ${result.message}`);
                }
            } else {
                logError(`✗ ${result.name}`);
                info(` ${result.message}`);
            }
        }

        newline();
        if (errorCount === 0) {
            success('All checks passed! Project is ready.');
        } else {
            warning(`${errorCount} issue(s) found.`);
            info('Fix the issues above and run "burger-api doctor" again.');
        }
        newline();

        process.exit(errorCount > 0 ? 1 : 0);
    });
