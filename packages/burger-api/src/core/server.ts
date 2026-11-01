import type { ServerOptions } from '../types/index.js';
import type {
    AdapterStartOptions,
    RuntimeAdapter,
    ServerHandle,
} from '../adapter/types.js';
import type { BunAdapterStartOptions } from '../adapter/bun/types.js';

/**
 * Non-foldable module id for the Bun adapter: bundlers keep dynamic imports
 * with non-static specifiers external, so `bun` never enters WinterCG bundles.
 */
function adapterModuleId(): string {
    return ['burger-api', 'adapter', 'bun'].join('/');
}

/**
 * Thin server wrapper. Owns the runtime adapter and delegates bootstrap to it.
 * The Bun adapter loads lazily on first `start()`, so WinterCG bundles — which
 * only use `toFetchHandler()` — never contain a `bun` import.
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
     * Starts the server via the configured adapter, loading the Bun adapter
     * lazily on first use.
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
            maxRequestBodySize:
                opts.maxRequestBodySize ?? this.options.maxRequestBodySize,
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
