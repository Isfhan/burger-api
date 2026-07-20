import type { ServerOptions } from '../types/index';
import type {
    AdapterStartOptions,
    RuntimeAdapter,
    ServerHandle,
} from '../adapter/types';
import { BunAdapter } from '../adapter/bun';

/**
 * Thin server wrapper. Owns the runtime adapter and delegates the actual
 * bootstrap to it, so the framework keeps a single, runtime-agnostic seam
 * (`ROADMAP.md` §4.2). Bun is the default adapter; other runtimes can be
 * supplied later without changing `Burger`.
 */
export class Server {
    private options: ServerOptions;
    private adapter: RuntimeAdapter;
    private handle?: ServerHandle;

    constructor(options: ServerOptions, adapter: RuntimeAdapter = new BunAdapter()) {
        this.options = options;
        this.adapter = adapter;
    }

    /**
     * Starts the server via the configured adapter.
     * @param opts adapter bootstrap options (static routes, fetch fallback, port).
     */
    public start(opts: AdapterStartOptions): void {
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
