/**
 * The schema registry — the named-schema (`models`) registry (* §9). Holds reusable named schemas resolved by string ref at compile time.
 *
 * Responsibilities:
 * - Register a named schema (seeded from `ServerOptions.models`).
 * - Resolve a name to its schema.
 * - Report whether a name exists.
 *
 * Resolution happens at compile time only (). This registry is
 * never consulted per request and never leaks models into the request
 * surface (). It is cleared together with the validator cache on
 * dev hot reload.
 */

import type { SchemaInput } from './types';

export class SchemaRegistry {
    private models = new Map<string, SchemaInput>();

    /** Registers a named schema. Overwrites an existing name. */
    register(name: string, schema: SchemaInput): void {
        this.models.set(name, schema);
    }

    /** True when `name` is registered. */
    has(name: string): boolean {
        return this.models.has(name);
    }

    /**
     * Resolves a model name to its schema. Throws if the name is unknown —
     * fail fast at compile time ().
     */
    resolve(name: string): SchemaInput {
        const schema = this.models.get(name);
        if (!schema) {
            throw new Error(
                `[burger-api] Unknown model reference: "${name}". ` +
                    `Register it in ServerOptions.models (burger.build.ts).`
            );
        }
        return schema;
    }

    /** Number of registered models. */
    get size(): number {
        return this.models.size;
    }

    /** Clears all registered models (dev hot reload). */
    clear(): void {
        this.models.clear();
    }
}

/** The shared, process-lifetime schema registry. */
export const schemaRegistry = new SchemaRegistry();
