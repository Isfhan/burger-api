/**
 * Precomputed `Allow` header strings for known routes, built once at compile
 * time — no comma-joined method list rebuild per 405 response.
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
