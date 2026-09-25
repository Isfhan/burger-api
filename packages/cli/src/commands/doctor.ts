/**
 * Doctor Command
 *
 * Validates project structure and detects issues.
 *
 * Example: burger-api doctor
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import {
    CONVENTION_DEFAULTS,
    compareEntryAndBuildConfig,
    resolveBuildConfig,
} from '../utils/config';
import { scanApiRoutes, ensureAppDirEnv } from '../utils/scanner';
import { PROJECT_HINT } from '../utils/build/project';
import type { BuildConfig } from '../types/index';
import {
    success,
    error as logError,
    info,
    newline,
    header,
    warning,
} from '../utils/logger';

export interface CheckResult {
    name: string;
    /** false = an error that makes `doctor` exit 1. */
    pass: boolean;
    message: string;
    /**
     * For passing checks: `info` = optional/not applicable (not a success),
     * `warning` = works but likely a mistake. Absent = plain success.
     */
    severity?: 'info' | 'warning';
}

function check(
    name: string,
    pass: boolean,
    message: string,
    severity?: CheckResult['severity']
): CheckResult {
    return severity ? { name, pass, message, severity } : { name, pass, message };
}

const CONVENTION_EXTS = ['.ts', '.js', '.mjs'] as const;

/** Finds the first existing file among `${cwd}/${base}${ext}` for each ext. */
function findExisting(
    cwd: string,
    base: string,
    exts: readonly string[]
): string | undefined {
    return exts.find((ext) => existsSync(join(cwd, `${base}${ext}`)));
}

/** Resolve a scan dir like the runtime: project root first, then src/. */
function resolveDir(cwd: string, dir: string): string | undefined {
    const fromCwd = resolve(cwd, dir);
    if (existsSync(fromCwd)) return fromCwd;
    const fromSrc = resolve(cwd, 'src', dir);
    return existsSync(fromSrc) ? fromSrc : undefined;
}

/** Import a module; returns the error message, or undefined when it loads. */
async function tryImport(file: string): Promise<string | undefined> {
    try {
        await import(pathToFileURL(file).href);
        return undefined;
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

export async function runChecks(cwd: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const rel = (p: string) => relative(cwd, p).split('\\').join('/');

    // 1. package.json
    const hasPkg = existsSync(join(cwd, 'package.json'));
    results.push(
        check(
            'package.json',
            hasPkg,
            hasPkg
                ? 'Found'
                : 'Not found — run this from a BurgerAPI project directory'
        )
    );

    // 2. burger-api listed AND installed (resolvable from node_modules)
    try {
        const pkg = JSON.parse(
            readFileSync(join(cwd, 'package.json'), 'utf-8')
        );
        const depVersion =
            pkg.dependencies?.['burger-api'] ??
            pkg.devDependencies?.['burger-api'];
        let installed = false;
        if (depVersion) {
            try {
                Bun.resolveSync('burger-api', cwd);
                installed = true;
            } catch {
                installed = false;
            }
        }
        results.push(
            check(
                'burger-api installed',
                !!depVersion && installed,
                !depVersion
                    ? 'Not found in package.json dependencies — run: bun add burger-api'
                    : installed
                      ? `Found (${depVersion})`
                      : `Listed in package.json (${depVersion}) but not installed — run: bun install`
            )
        );
    } catch {
        results.push(
            check('burger-api installed', false, 'Could not read package.json')
        );
    }

    // 3. burger.build.(ts|js) — must load when present
    const buildConfigFile = [
        'burger.build.ts',
        'burger.build.js',
        'burger.config.ts',
        'burger.config.js',
    ].find((name) => existsSync(join(cwd, name)));
    let config: BuildConfig = { ...CONVENTION_DEFAULTS };
    if (buildConfigFile) {
        try {
            config = await resolveBuildConfig(cwd, { throwOnError: true });
            results.push(check(buildConfigFile, true, 'Found'));
        } catch (err) {
            results.push(
                check(
                    buildConfigFile,
                    false,
                    `Could not load: ${err instanceof Error ? err.message : String(err)}`
                )
            );
        }
    } else {
        results.push(
            check(
                'burger.build.ts',
                true,
                'Not found (using convention defaults)',
                'info'
            )
        );
    }

    // 4. src/index.(ts|js|mjs)
    const indexExt = findExisting(join(cwd, 'src'), 'index', CONVENTION_EXTS);
    const entryFile = indexExt ? `src/index${indexExt}` : undefined;
    results.push(
        check(
            entryFile ?? 'src/index.ts',
            !!indexExt,
            indexExt ? 'Found' : 'Not found (also looked for src/index.js, src/index.mjs)'
        )
    );

    // 5. API routes under the configured apiDir. A missing default apiDir is
    // fine (pages-only / WebSocket-only apps); a missing custom one is not.
    ensureAppDirEnv(entryFile ? join(cwd, entryFile) : undefined);
    const apiRoot = resolveDir(cwd, config.apiDir);
    if (!apiRoot) {
        const isDefault = config.apiDir === CONVENTION_DEFAULTS.apiDir;
        results.push(
            check(
                `apiDir (${config.apiDir})`,
                isDefault,
                isDefault
                    ? 'Not found — no API routes (fine for pages-only apps)'
                    : 'Directory does not exist — check apiDir in burger.build',
                isDefault ? 'info' : undefined
            )
        );
    } else {
        let routes: Awaited<ReturnType<typeof scanApiRoutes>> = [];
        let scanError: string | undefined;
        try {
            routes = await scanApiRoutes(cwd, config.apiDir, config.apiPrefix);
        } catch (err) {
            scanError = err instanceof Error ? err.message : String(err);
        }
        if (scanError) {
            results.push(check('Route files', false, scanError));
        } else if (routes.length === 0) {
            results.push(
                check(
                    'Route files',
                    false,
                    `No route files (route.ts/.js/.mjs) found in ${rel(apiRoot)}/`
                )
            );
        } else {
            // Load every route and convention module: catches syntax
            // errors and broken imports before `dev`/`build` do.
            const broken: string[] = [];
            for (const r of routes) {
                const files = [
                    r.importPath,
                    r.schemaPath,
                    r.openapiPath,
                    r.configPath,
                    r.hooksPath,
                ].filter((f): f is string => !!f);
                for (const file of files) {
                    const err = await tryImport(file);
                    if (err) broken.push(`${rel(file)}: ${err}`);
                }
            }
            results.push(
                check(
                    'Route files',
                    broken.length === 0,
                    broken.length === 0
                        ? `${routes.length} route(s) discovered in ${rel(apiRoot)}/`
                        : `Failed to load:\n${broken.map((b) => `      ${b}`).join('\n')}`
                )
            );
        }
    }

    // 6. tsconfig.json (or jsconfig.json for JavaScript projects)
    const hasTsconfig = existsSync(join(cwd, 'tsconfig.json'));
    const hasJsconfig = existsSync(join(cwd, 'jsconfig.json'));
    results.push(
        check(
            hasJsconfig && !hasTsconfig ? 'jsconfig.json' : 'tsconfig.json',
            hasTsconfig || hasJsconfig,
            hasTsconfig || hasJsconfig
                ? 'Found'
                : 'Not found (tsconfig.json or jsconfig.json)'
        )
    );

    // 7. Legacy config warning
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

    // 8. dev/start (entry options) vs build (burger.build) agreement
    if (entryFile) {
        const mismatches = compareEntryAndBuildConfig(cwd, entryFile, config);
        results.push(
            mismatches.length === 0
                ? check(`${entryFile} ↔ burger.build`, true, 'Dirs and prefixes agree')
                : check(
                      `${entryFile} ↔ burger.build`,
                      true,
                      mismatches.join('\n'),
                      'warning'
                  )
        );
    }

    // 9. Optional files (info only)
    for (const stem of ['hooks', 'plugins', 'providers', 'openapi.config']) {
        const ext = findExisting(join(cwd, 'src'), stem, CONVENTION_EXTS);
        results.push(
            ext
                ? check(`src/${stem}${ext}`, true, 'Found')
                : check(`src/${stem}`, true, 'Not found (optional)', 'info')
        );
    }

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
            const problem =
                'Not in a BurgerAPI project directory (no package.json found).';
            if (options.json) {
                console.log(JSON.stringify({ error: problem }));
            } else {
                logError(problem);
                info(PROJECT_HINT);
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

        for (const result of results) {
            const line =
                result.message === 'Found'
                    ? result.name
                    : `${result.name} — ${result.message}`;
            if (!result.pass) logError(line);
            else if (result.severity === 'warning') warning(line);
            else if (result.severity === 'info') info(line);
            else success(line);
        }

        const warningCount = results.filter(
            (r) => r.severity === 'warning'
        ).length;
        newline();
        if (errorCount === 0) {
            success(
                warningCount === 0
                    ? 'All checks passed! Project is ready.'
                    : `No errors, ${warningCount} warning(s) — see above.`
            );
        } else {
            warning(`${errorCount} issue(s) found.`);
            info('Fix the issues above and run "burger-api doctor" again.');
        }
        newline();

        process.exit(errorCount > 0 ? 1 : 0);
    });
