/**
 * Module evaluation must not construct `Response`/`Request` or call
 * `fetch`/timers — Cloudflare Workers forbids that at global scope.
 * Requires a fresh `dist` build; REQUIRE_BUILD_BUNDLE=true makes it fail hard.
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
            // Cache-bust so a prior import in the same process cannot hide
            // a real violation via the module cache.
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
