/**
 * Phase 1 routing microbenchmark.
 *
 * Measures request throughput (requests/sec) for the three route kinds after
 * the Hybrid Router upgrade:
 *   - static   (served by Bun's native `routes` map)
 *   - param     (served by the internal trie via `Router.fetch`)
 *   - wildcard  (served by the internal trie via `Router.fetch`)
 *
 * Run with:  bun run bench/phase1-routing.bench.ts
 *
 * To gate against regression, capture these numbers for the current build, then
 * rebuild from the pre-Phase-1 commit (or `git stash` the router changes) and run
 * again. Phase 1 must stay within 5% throughput of that Phase 0 baseline.
 */
import { Burger } from '../src/index';
import type { RouteDefinition, BurgerRequest } from '../src/types/index';

const PORT = 4123;
const BASE = `http://localhost:${PORT}`;

function json(body: unknown) {
    return () => Response.json(body);
}

function makeRoutes(): RouteDefinition[] {
    const routes: RouteDefinition[] = [];

    // Static routes (a handful, to be realistic).
    for (const p of ['/health', '/api/ping', '/api/version', '/api/status']) {
        routes.push({ path: p, handlers: { GET: json({ ok: true, p }) } });
    }

    // Param routes.
    routes.push({
        path: '/api/users/:id',
        handlers: {
            GET: (req: BurgerRequest) => Response.json({ id: req.params!.id }),
            POST: (req: BurgerRequest) =>
                Response.json({ id: req.params!.id, created: true }),
        },
    });
    routes.push({
        path: '/api/posts/:slug',
        handlers: {
            GET: (req: BurgerRequest) =>
                Response.json({ slug: req.params!.slug }),
        },
    });

    // Wildcard route.
    routes.push({
        path: '/files/*',
        handlers: {
            GET: (req: BurgerRequest) =>
                Response.json({ wildcard: req.wildcardParams ?? [] }),
        },
        isWildcard: true,
    });

    return routes;
}

async function measure(
    label: string,
    path: string,
    n: number
): Promise<number> {
    // Warmup
    for (let i = 0; i < 200; i++) await fetch(BASE + path);

    const start = performance.now();
    for (let i = 0; i < n; i++) {
        const res = await fetch(BASE + path);
        // Consume the body so connections close cleanly.
        await res.arrayBuffer();
    }
    const elapsed = (performance.now() - start) / 1000;
    const rps = Math.round(n / elapsed);
    console.log(
        `  ${label.padEnd(10)} ${path.padEnd(22)} ${rps.toLocaleString()} req/s`
    );
    return rps;
}

async function main() {
    const app = new Burger({ apiRoutes: makeRoutes() });
    await app.serve(PORT);

    const N = 30_000;
    console.log(
        `\nPhase 1 routing microbenchmark (${N} req/kind, localhost loopback)\n`
    );

    const staticRps = await measure('static', '/health', N);
    const paramRps = await measure('param', '/api/users/42', N);
    const wildcardRps = await measure('wildcard', '/files/a/b/c', N);

    console.log(
        `\nSummary: static=${staticRps.toLocaleString()}, param=${paramRps.toLocaleString()}, ` +
            `wildcard=${wildcardRps.toLocaleString()} req/s`
    );
    console.log(
        'Regression gate: each must be within 5% throughput of the Phase 0 baseline.'
    );

    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
