/**
 * Regression test for the Cloudflare Workers boot crash found in Phase 3 of
 * the v1.0.0 release audit: `utils/response.ts` had a dead, unused
 * module-top-level `METHOD_NOT_ALLOWED = new Response(...)` constant. Eager
 * construction at import time crashed every Worker before any request was
 * handled ("Disallowed operation called within global scope. Asynchronous
 * I/O... are not allowed within global scope.").
 *
 * This can't run inside a real Workers runtime here, so it approximates the
 * restriction: importing the built package must not synchronously construct
 * a `Response`/`Request`, or call `fetch`/`setTimeout`/`setInterval`, during
 * module evaluation. Those are exactly the operations Workers forbids at
 * global scope, and exactly the shape of the original bug (an eager
 * top-level side effect that only a real multi-runtime boot ever caught).
 *
 * Requires a fresh `dist` build (`bun run build` in packages/burger-api).
 * Run with `REQUIRE_BUILD_BUNDLE=true` (set in CI) to make a missing build
 * a hard failure instead of a skip.
 */
import { describe, it, expect } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';

const REQUIRE_DIST =
    process.env.REQUIRE_BUILD_BUNDLE === 'true' || process.env.CI === 'true';
const DIST_INDEX = join(import.meta.dir, '..', '..', 'dist', 'src', 'index.js');

describe('importing the built package does no disallowed global-scope work', () => {
    if (!existsSync(DIST_INDEX)) {
        if (REQUIRE_DIST) {
            throw new Error(
                `This test requires a build, but dist was not found at: ${DIST_INDEX}. Run "bun run build" first.`
            );
        }
        console.warn('Skipping no-global-scope-side-effects test: dist not found at', DIST_INDEX);
        return;
    }

    it('does not construct Response/Request or call fetch/timers at module top level', async () => {
        const OriginalResponse = globalThis.Response;
        const OriginalRequest = globalThis.Request;
        const originalFetch = globalThis.fetch;
        const originalSetTimeout = globalThis.setTimeout;
        const originalSetInterval = globalThis.setInterval;

        let duringImport = true;
        const violations: string[] = [];

        const guard = (label: string): void => {
            if (duringImport) violations.push(label);
        };

        class GuardedResponse extends OriginalResponse {
            constructor(...args: ConstructorParameters<typeof OriginalResponse>) {
                guard('new Response()');
                super(...args);
            }
        }
        class GuardedRequest extends OriginalRequest {
            constructor(...args: ConstructorParameters<typeof OriginalRequest>) {
                guard('new Request()');
                super(...args);
            }
        }

        globalThis.Response = GuardedResponse;
        globalThis.Request = GuardedRequest;
        globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
            guard('fetch()');
            return originalFetch(...args);
        }) as typeof fetch;
        globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
            guard('setTimeout()');
            return originalSetTimeout(...args);
        }) as typeof setTimeout;
        globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
            guard('setInterval()');
            return originalSetInterval(...args);
        }) as typeof setInterval;

        try {
            // Cache-bust: append a query so a prior test run in the same
            // process (module cache) can't hide a real violation.
            await import(`${DIST_INDEX}?t=${Date.now()}`);
        } finally {
            duringImport = false;
            globalThis.Response = OriginalResponse;
            globalThis.Request = OriginalRequest;
            globalThis.fetch = originalFetch;
            globalThis.setTimeout = originalSetTimeout;
            globalThis.setInterval = originalSetInterval;
        }

        expect(violations).toEqual([]);
    });
});
