import { resolve } from 'path';

function formatBunBuildLogs(logs: unknown): string {
    if (!Array.isArray(logs) || logs.length === 0) {
        return '';
    }

    const messages: string[] = [];
    for (const item of logs) {
        if (!item || typeof item !== 'object') continue;

        const log = item as {
            level?: string;
            message?: string;
            text?: string;
            name?: string;
            position?: { file?: string; line?: number; column?: number };
        };
        const text =
            (typeof log.message === 'string' && log.message) ||
            (typeof log.text === 'string' && log.text) ||
            (typeof log.name === 'string' && log.name) ||
            '';
        if (!text) continue;

        const level =
            typeof log.level === 'string' ? log.level.toUpperCase() : 'ERROR';
        const file = log.position?.file ? `${log.position.file}` : '';
        const line =
            typeof log.position?.line === 'number'
                ? `:${log.position.line}`
                : '';
        const column =
            typeof log.position?.column === 'number'
                ? `:${log.position.column}`
                : '';
        const location = file ? ` (${file}${line}${column})` : '';
        messages.push(`- [${level}] ${text}${location}`);
    }
    return messages.join('\n');
}

function extractBunBuildDetails(err: unknown): string {
    if (!err || typeof err !== 'object') {
        return '';
    }

    const anyErr = err as {
        logs?: unknown;
        errors?: unknown;
        cause?: { logs?: unknown; errors?: unknown };
    };
    const candidates = [
        anyErr.logs,
        anyErr.errors,
        anyErr.cause?.logs,
        anyErr.cause?.errors,
    ];

    for (const candidate of candidates) {
        const detail = formatBunBuildLogs(candidate);
        if (detail) return detail;
    }
    return '';
}

export function createBunBuildOptions(options: {
    entryPath: string;
    outDir: string;
    cwd: string;
    outfile: string;
    target?: string;
    minify?: boolean;
    sourcemap?: string;
    compile?: boolean;
    bytecode?: boolean;
}): Parameters<typeof Bun.build>[0] {
    const buildOptions: Parameters<typeof Bun.build>[0] = {
        entrypoints: [options.entryPath],
        outdir: options.outDir,
        target: (options.target as 'bun') || 'bun',
        minify: options.minify ?? false,
        splitting: false,
        sourcemap:
            options.sourcemap === undefined
                ? undefined
                : (options.sourcemap as 'none' | 'linked' | 'inline' | 'external'),
    };

    const ext = buildOptions as unknown as Record<string, unknown>;
    ext.naming = {
        chunk: '[name]-[hash].[ext]',
        asset: '[name]-[hash].[ext]',
    };

    if (options.compile) {
        ext.compile = {
            outfile: resolve(options.cwd, options.outfile),
            ...(options.target && { target: options.target }),
        };
        if (options.bytecode !== false) {
            ext.bytecode = true;
        }
        delete ext.outdir;
    }

    return buildOptions;
}

export async function runBunBuildOrThrow(
    buildOptions: Parameters<typeof Bun.build>[0]
): Promise<Awaited<ReturnType<typeof Bun.build>>> {
    let result: Awaited<ReturnType<typeof Bun.build>>;
    try {
        result = await Bun.build(buildOptions);
    } catch (err) {
        const detail = extractBunBuildDetails(err);
        const message = err instanceof Error ? err.message : 'Bun.build failed.';
        if (detail) {
            throw new Error(`${message}\n${detail}`);
        }
        throw new Error(message);
    }

    if (!result.success) {
        const detail = formatBunBuildLogs((result as { logs?: unknown }).logs);
        if (detail) {
            throw new Error(`Bun.build failed.\n${detail}`);
        }
        throw new Error('Bun.build failed.');
    }

    return result;
}
