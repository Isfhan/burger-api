import { dirname, resolve } from 'path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';

export function prepareVirtualEntry(options: {
    cwd: string;
    outfile: string;
    pageDir: string;
    source: string;
    hasPages: boolean;
}): { outDir: string; virtualSourcePath: string; virtualPath: string } {
    const outDir = resolve(options.cwd, dirname(options.outfile));
    mkdirSync(outDir, { recursive: true });

    const virtualEntryDir = options.hasPages
        ? resolve(options.cwd, options.pageDir)
        : outDir;
    mkdirSync(virtualEntryDir, { recursive: true });

    const virtualSourcePath = resolve(
        virtualEntryDir,
        '__burger_build_entry__.ts'
    );
    const virtualPath = virtualSourcePath.split('\\').join('/');
    writeFileSync(virtualSourcePath, options.source, 'utf-8');

    return { outDir, virtualSourcePath, virtualPath };
}

export function cleanupVirtualEntry(virtualSourcePath: string): void {
    if (existsSync(virtualSourcePath)) {
        unlinkSync(virtualSourcePath);
    }
}

export async function finalizeBuildOutputs(options: {
    result: Awaited<ReturnType<typeof Bun.build>>;
    cwd: string;
    outfile: string;
    outDir: string;
    compile?: boolean;
}): Promise<{ path: string; size: number }[]> {
    const desiredOut = resolve(options.cwd, options.outfile);
    const outputs: { path: string; size: number }[] = [];

    if (!options.result.outputs?.length) {
        return outputs;
    }

    const first = options.result.outputs[0] as Blob & { path?: string };
    const outPath = first.path ? resolve(first.path) : undefined;

    const entryArtifacts = new Set<string>([
        resolve(options.outDir, '__burger_build_entry__.js'),
    ]);
    if (outPath?.endsWith('__burger_build_entry__.js')) {
        entryArtifacts.add(outPath);
    }

    if (!options.compile && outPath && outPath !== desiredOut) {
        const blob = first as Blob;
        await Bun.write(desiredOut, blob);
        outputs.push({ path: desiredOut, size: blob.size });
    } else {
        outputs.push({
            path: outPath ?? desiredOut,
            size: (first as Blob).size ?? 0,
        });
    }

    for (const entryArtifact of entryArtifacts) {
        if (entryArtifact !== desiredOut && existsSync(entryArtifact)) {
            unlinkSync(entryArtifact);
        }
    }

    return outputs;
}
