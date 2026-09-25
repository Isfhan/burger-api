/**
 * Precomputed `Allow` header strings for known routes.
 *
 * Avoids rebuilding the comma-joined method list on every 405 response.
 * Built once at compile time and frozen for the lifetime of the server.
 */
export class AllowCache {
    private cache = new Map<string, string>();

    /**
     * Builds the `Allow` header value from a list of methods.
     * @example compute(['GET', 'POST']) => 'GET, POST'
     */
    compute(methods: string[]): string {
        return methods.join(', ');
    }

    /**
     * Stores the `Allow` value for a path.
     */
    set(path: string, value: string): void {
        this.cache.set(path, value);
    }

    /**
     * Returns the precomputed `Allow` value for a path, if known.
     */
    get(path: string): string | undefined {
        return this.cache.get(path);
    }
}
