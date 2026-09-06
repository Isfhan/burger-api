/**
 * Regression test for a real Cloudflare Workers bundling gotcha found this
 * session: `src/index.ts` used to statically value-re-export
 * `{ ASSET_MIME, contentTypeFor }` from `core/assets.ts`, which imports
 * `readdir` from `node:fs/promises` at its own top level — so importing the
 * package's main entry unconditionally pulled disk-scanning code into the
 * static module graph, even for AOT/WinterCG deployments that never touch a
 * filesystem. `node:fs` has no meaningful polyfill on edge runtimes (unlike
 * `node:path`, which Cloudflare's `nodejs_compat` flag fully and correctly
 * implements as pure string manipulation) — so this specifically walks for
 * `fs`, not every Node builtin.
 *
 * The existing `web-standard.test.ts` "WinterCG bundle shape" test uses
 * `Bun.build({ target: 'browser' })` and would NOT have caught this: Bun's
 * bundler shims missing Node builtins rather than hard-failing the way
 * wrangler's (esbuild-based) resolution does — confirmed by running a real
 * `wrangler dev` against a project built on the unfixed framework, which
 * failed with "Could not resolve 'fs'" while the Bun.build-based test
 * passed the whole time.
 *
 * The bug lived in a transitively re-exported file (`core/assets.js`), not
 * `index.js` itself, so a single-file text scan wouldn't have caught it —
 * this walks the real static import/export graph starting from the entry,
 * following only `import ... from`/`export ... from` specifiers (never
 * `import(...)`, which is how the framework already lazily loads its
 * dev-only, filesystem-scanning modules on the Bun/Node dev path).
 *
 * Requires a fresh `dist` build (`bun run build` in packages/burger-api).
 * Run with `REQUIRE_BUILD_BUNDLE=true` (set in CI) to make a missing build
 * a hard failure instead of a skip.
 */
import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const REQUIRE_DIST =
    process.env.REQUIRE_BUILD_BUNDLE === 'true' || process.env.CI === 'true';
const DIST_INDEX = join(import.meta.dir, '..', '..', 'dist', 'src', 'index.js');

/**
 * Matches a top-level `import ... from '<spec>'` or `export ... from
 * '<spec>'` statement — deliberately NOT `import('<spec>')`.
 */
const STATIC_IMPORT_RE = /^\s*(?:import|export)(?:(?!\().)*?\bfrom\s+['"]([^'"]+)['"]/gm;

const FS_SPECIFIERS = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);

/**
 * Walks the static import/export graph reachable from `entry`, resolving
 * relative specifiers to files under `dist/`. Returns every bare (non-relative)
 * specifier found, e.g. `node:fs/promises`, `zod/v4`. Bare specifiers are
 * leaves (not resolved further) since only the framework's own relative
 * modules matter for "does the entry statically drag in fs".
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
