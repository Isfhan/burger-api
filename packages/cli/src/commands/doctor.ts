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

interface CheckResult {
    name: string;
    pass: boolean;
    message: string;
}

function check(name: string, pass: boolean, message: string): CheckResult {
    return { name, pass, message };
}

async function runChecks(cwd: string): Promise<CheckResult[]> {
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

    // 4. src/index.ts
    const hasIndex = existsSync(join(cwd, 'src', 'index.ts'));
    results.push(
        check('src/index.ts', hasIndex, hasIndex ? 'Found' : 'Not found')
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

    // 7. tsconfig.json
    const hasTsconfig = existsSync(join(cwd, 'tsconfig.json'));
    results.push(
        check('tsconfig.json', hasTsconfig, hasTsconfig ? 'Found' : 'Not found')
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
    const hasHooks = existsSync(join(cwd, 'src', 'hooks.ts'));
    results.push(
        check('src/hooks.ts', true, hasHooks ? 'Found' : 'Not found (optional)')
    );

    const hasPlugins = existsSync(join(cwd, 'src', 'plugins.ts'));
    results.push(
        check(
            'src/plugins.ts',
            true,
            hasPlugins ? 'Found' : 'Not found (optional)'
        )
    );

    const hasOpenapiConfig = existsSync(join(cwd, 'src', 'openapi.config.ts'));
    results.push(
        check(
            'src/openapi.config.ts',
            true,
            hasOpenapiConfig ? 'Found' : 'Not found (optional)'
        )
    );

    return results;
}

export const doctorCommand = new Command('doctor')
    .description('Validate project structure and detect issues')
    .action(async () => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            info('Run this from your project root.');
            process.exit(1);
        }

        const cwd = process.cwd();
        const results = await runChecks(cwd);

        newline();
        header('BurgerAPI Doctor');
        newline();

        let errorCount = 0;
        for (const result of results) {
            if (result.pass) {
                success(`✓ ${result.name}`);
                if (result.message !== 'Found') {
                    info(` ${result.message}`);
                }
            } else {
                errorCount++;
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
