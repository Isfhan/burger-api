import type { ServerOptions } from '../types/index.js';
import type {
    AdapterStartOptions,
    RuntimeAdapter,
    ServerHandle,
} from '../adapter/types.js';
import type { BunAdapterStartOptions } from '../adapter/bun/types.js';

/**
 * Non-foldable module id for the Bun adapter. Bundlers keep dynamic imports
 * with non-static specifiers external, so `bun` never enters the graph of
 * WinterCG bundles; at runtime the package self-reference
 * (`burger-api/adapter/bun`, see package.json exports) resolves it.
 */
function adapterModuleId(): string {
    return ['burger-api', 'adapter', 'bun'].join('/');
}

/**
 * Thin server wrapper. Owns the runtime adapter and delegates the actual
 * bootstrap to it, so the framework keeps a single, runtime-agnostic seam.
 * Bun is the default adapter but is loaded lazily (dynamic import on first
 * `start()`) so WinterCG bundles — which only use `toFetchHandler()` — never
 * contain `import { serve } from 'bun'`.
 */
export class Server {
    private options: ServerOptions;
    private adapter?: RuntimeAdapter;
    private handle?: ServerHandle;

    constructor(options: ServerOptions, adapter?: RuntimeAdapter) {
        this.options = options;
        this.adapter = adapter;
    }

    /**
     * Starts the server via the configured adapter.
     * The Bun adapter is loaded lazily on first start (dynamic import), keeping
     * the module graph free of `bun` imports for non-Bun targets. The specifier
     * is intentionally non-static so every bundler (Bun, esbuild, wrangler)
     * leaves the import external instead of resolving `bun` builtins.
     * @param opts adapter bootstrap options (static routes, fetch fallback, port).
     */
    public async start(
        opts: AdapterStartOptions | BunAdapterStartOptions
    ): Promise<void> {
        if (!this.adapter) {
            const { BunAdapter } = (await import(adapterModuleId())) as typeof import('../adapter/bun/index.js');
            this.adapter = new BunAdapter();
        }
        this.handle = this.adapter.start({
            ...opts,
            hostname: opts.hostname ?? this.options.hostname,
            debug: opts.debug ?? this.options.debug,
        });
    }

    /**
     * Stops the running server (no-op if it was never started).
     */
    public stop(): void {
        if (this.handle) {
            this.handle.stop();
            console.log('Server stopped.');
            this.handle = undefined;
        }
    }

    /**
     * Returns true once the adapter has started a server.
     */
    public isRunning(): boolean {
        return this.handle !== undefined;
    }
}
