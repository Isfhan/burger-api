/**
 * The built package's static module graph must not pull in `node:fs`: edge
 * runtimes cannot polyfill it. Requires a fresh `dist` build; set
 * REQUIRE_BUILD_BUNDLE=true to make a missing build a hard failure.
 */
import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const REQUIRE_DIST =
    process.env.REQUIRE_BUILD_BUNDLE === 'true' || process.env.CI === 'true';
const DIST_INDEX = join(import.meta.dir, '..', '..', 'dist', 'src', 'index.js');

/** Matches top-level `import ... from` / `export ... from`, not `import()`. */
const STATIC_IMPORT_RE = /^\s*(?:import|export)(?:(?!\().)*?\bfrom\s+['"]([^'"]+)['"]/gm;

const FS_SPECIFIERS = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);

/**
 * Returns every bare specifier reachable through static import/export
 * statements from `entry`. Bare specifiers are leaves, not resolved further.
 */
function walkStaticGraph(entry: string): string[] {
    const visited = new Set<string>();
    const bareSpecifiers: string[] = [];

    function visit(filePath: string): void {
        const abs = resolve(filePath);
        if (visited.has(abs) || !existsSync(abs)) return;
        visited.add(abs);

        const source = readFileSync(abs, 'utf-8');
        for (const match of source.matchAll(STATIC_IMPORT_RE)) {
            const spec = match[1];
            if (!spec) continue;
            if (spec.startsWith('.')) {
                visit(join(dirname(abs), spec));
            } else {
                bareSpecifiers.push(spec);
            }
        }
    }

    visit(entry);
    return bareSpecifiers;
}

describe('the built package has no statically-reachable fs import', () => {
    if (!existsSync(DIST_INDEX)) {
        if (REQUIRE_DIST) {
            throw new Error(
                `This test requires a build, but dist was not found at: ${DIST_INDEX}. Run "bun run build" first.`
            );
        }
        console.warn('Skipping no-static-fs-import test: dist not found at', DIST_INDEX);
        return;
    }

    it('dist/src/index.js never statically imports/exports from fs, walking the full local module graph', () => {
        const bareSpecifiers = walkStaticGraph(DIST_INDEX);
        const fsSpecifiers = bareSpecifiers.filter((s) => FS_SPECIFIERS.has(s));
        expect(fsSpecifiers).toEqual([]);
    });
});
