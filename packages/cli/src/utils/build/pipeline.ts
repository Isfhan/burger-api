import { resolveBuildConfig } from '../config';
import { scanApiRoutes, scanPageRoutes } from '../scanner';
import { generateVirtualEntrySource } from '../virtual-entry';
import { createBunBuildOptions, runBunBuildOrThrow } from './bun';
import {
    cleanupVirtualEntry,
    finalizeBuildOutputs,
    prepareVirtualEntry,
} from './entry';
import {
    cleanupEntryOptionsModule,
    prepareEntryOptionsModule,
} from '../entry-options';

export interface VirtualBuildResult {
    success: boolean;
    hasPages: boolean;
    outputs: { path: string; size: number }[];
}

export async function runVirtualEntryBuild(options: {
    cwd: string;
    entryFile: string;
    outfile: string;
    target?: string;
    minify?: boolean;
    sourcemap?: string;
    compile?: boolean;
    bytecode?: boolean;
}): Promise<VirtualBuildResult> {
    const config = await resolveBuildConfig(options.cwd);
    const entryOptions = prepareEntryOptionsModule({
        cwd: options.cwd,
        entryFile: options.entryFile,
    });

    const [apiEntries, pageEntries] = await Promise.all([
        scanApiRoutes(options.cwd, config.apiDir, config.apiPrefix),
        scanPageRoutes(options.cwd, config.pageDir, config.pagePrefix),
    ]);

    if (apiEntries.length === 0 && pageEntries.length === 0) {
        throw new Error(
            `No routes found. Ensure ${config.apiDir} or ${config.pageDir} ` +
                `exist and contain route.ts files or page files.`
        );
    }

    const source = generateVirtualEntrySource(
        config,
        apiEntries,
        pageEntries,
        entryOptions.importPath
    );
    const hasPages = pageEntries.length > 0;
    const { outDir, virtualPath, virtualSourcePath } = prepareVirtualEntry({
        cwd: options.cwd,
        outfile: options.outfile,
        pageDir: config.pageDir,
        source,
        hasPages,
    });

    const buildOptions = createBunBuildOptions({
        entryPath: virtualPath,
        outDir,
        cwd: options.cwd,
        outfile: options.outfile,
        target: options.target,
        minify: options.minify,
        sourcemap: options.sourcemap,
        compile: options.compile,
        bytecode: options.bytecode,
    });

    try {
        const result = await runBunBuildOrThrow(buildOptions);
        const outputs = await finalizeBuildOutputs({
            result,
            cwd: options.cwd,
            outfile: options.outfile,
            outDir,
            compile: options.compile,
        });
        return { success: result.success ?? false, hasPages, outputs };
    } finally {
        cleanupVirtualEntry(virtualSourcePath);
        cleanupEntryOptionsModule(entryOptions.tempFilePath);
    }
}
