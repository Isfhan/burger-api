/**
 * The schema preparation component — the core of Validation 2.0
 * (phase3 §12.7, §13.1).
 *
 * Responsibilities:
 * - Walk a `RouteSchema` and prepare each slot into a `CompiledValidator`.
 * - Detect the adapter (connector) per slot; compute identity; consult the
 *   cache.
 * - Build value-conversion plans (M4) and response validators (M5) when
 *   present.
 * - Look up model refs (M3) before per-slot preparation.
 *
 * This runs ONCE per route when it is set up (before `serve()`). It never
 * executes when a request comes in and never throws on a per-request path
 * (phase3 §4.10, §18 R9). Every schema is prepared a single time; identical
 * schemas (by reference or model ref) share one cached validator.
 */

import type { RouteSchema } from '../types/index';
import { detectAdapter } from './adapter';
import { ValidatorCache } from './cache';
import { schemaRegistry, SchemaRegistry } from './registry';
// Side-effect imports: register the Zod + Standard Schema adapters.
import './adapters/zod';
import './adapters/standard';
import type {
    CompiledRouteValidators,
    CompiledValidator,
    SchemaInput,
    ValidationSlot,
    ValidatorConfig,
    CoercionPlan,
} from './types';
import { buildPlan as buildCoercionPlan } from './coerce';

/** The shared, process-lifetime validator cache (phase3 §5). */
export const validatorCache = new ValidatorCache();

/** Request slots that can carry a schema in `RouteSchema`. */
const REQUEST_SLOTS: ValidationSlot[] = [
    'params',
    'query',
    'headers',
    'cookies',
    'body',
];

/**
 * Resolves model-ref strings into concrete schemas before per-slot
 * compilation. A slot value that is a `string` is treated as a model name and
 * looked up in the registry. Throws (naming the method + slot + model) on a
 * missing ref so the failure is fail-fast at compile time (phase3 §9.11).
 */
function resolveModelRef(
    value: SchemaInput | string,
    method: string,
    slot: ValidationSlot,
    registry: SchemaRegistry
): SchemaInput {
    if (typeof value === 'string') {
        if (!registry.has(value)) {
            throw new Error(
                `[burger-api] Unresolvable model ref "${value}" in ` +
                    `schema.${method}.${slot}. Register it in ` +
                    `ServerOptions.models.`
            );
        }
        return registry.resolve(value);
    }
    return value;
}

/**
 * Compiles a route's `schema` into `CompiledRouteValidators`.
 *
 * @param schema - the raw route schema (model refs allowed as string).
 * @param config - the validator configuration (coercion / response flags).
 * @param cache - the validator cache (shared instance by default).
 * @param registry - the schema registry for model-ref resolution.
 */
export function compileRouteSchema(
    schema: RouteSchema,
    config: ValidatorConfig = {},
    cache: ValidatorCache = validatorCache,
    registry: SchemaRegistry = schemaRegistry
): CompiledRouteValidators {
    const methods: CompiledRouteValidators['methods'] = {};

    for (const rawMethod of Object.keys(schema)) {
        const method = rawMethod.toLowerCase();
        const m = schema[rawMethod] || {};
        const compiledMethod: CompiledRouteValidators['methods'][string] = {};

        // Coercion is opt-in: app-level config.coerce OR per-route
        // schema[method].coerce override (phase3 §7.6, §11).
        const coerceEnabled =
            config.coerce === true ||
            (m as Record<string, unknown>).coerce === true;

        for (const slot of REQUEST_SLOTS) {
            const raw = (m as Record<string, SchemaInput | string | undefined>)[
                slot
            ];
            if (raw === undefined) continue;
            const slotSchema = resolveModelRef(raw, method, slot, registry);
            compiledMethod[slot] = compileSlot(
                slotSchema,
                slot,
                cache,
                typeof raw === 'string' ? raw : undefined
            );
        }

        // Build coercion plans only when coercion is enabled (phase3 §7.4).
        if (coerceEnabled) {
            const coercion: NonNullable<
                CompiledRouteValidators['methods'][string]['coercion']
            > = {};
            for (const slot of ['query', 'params', 'headers', 'cookies'] as const) {
                const raw = (m as Record<string, SchemaInput | string | undefined>)[
                    slot
                ];
                if (raw === undefined) continue;
                const slotSchema = resolveModelRef(raw, method, slot, registry);
                const plan: CoercionPlan | undefined = buildCoercionPlan(
                    slotSchema,
                    slot
                );
                if (plan) coercion[slot] = plan;
            }
            if (Object.keys(coercion).length > 0) {
                compiledMethod.coercion = coercion;
            }
        }

        methods[method] = compiledMethod;
    }

    // Compile response schemas (per-status) when present (phase3 §8).
    const response = compileResponseSchemas(schema, cache, registry);

    const result: CompiledRouteValidators = { methods };
    if (response) result.response = response;
    return result;
}

/**
 * Compiles per-status `response` schemas into a map of `CompiledValidator`s.
 * Returns undefined when no `response` schemas are declared (phase3 §8.4).
 */
function compileResponseSchemas(
    schema: RouteSchema,
    cache: ValidatorCache,
    registry: SchemaRegistry
): Record<string, Record<string, CompiledValidator>> | undefined {
    const response: Record<string, Record<string, CompiledValidator>> = {};
    let any = false;
    for (const rawMethod of Object.keys(schema)) {
        const method = rawMethod.toLowerCase();
        const m = schema[rawMethod] || {};
        const responseSchemas = (m as Record<string, Record<string, SchemaInput | string> | undefined>)
            .response;
        if (!responseSchemas) continue;
        const byStatus: Record<string, CompiledValidator> = {};
        for (const statusKey of Object.keys(responseSchemas)) {
            const raw = responseSchemas[statusKey];
            const slotSchema = resolveModelRef(raw, rawMethod, 'body', registry);
            byStatus[statusKey] = compileSlot(slotSchema, 'body', cache);
            any = true;
        }
        response[method] = byStatus;
    }
    return any ? response : undefined;
}

/**
 * Compiles a single slot schema into a `CompiledValidator`, consulting the
 * cache by identity first (phase3 §4.6, §5). When `modelRef` is provided, it
 * is recorded on the compiled validator for future compile-time optimization
 * (serialization reserved for Phase 8).
 */
function compileSlot(
    slotSchema: SchemaInput,
    slot: ValidationSlot,
    cache: ValidatorCache,
    modelRef?: string
): CompiledValidator {
    const adapter = detectAdapter(slotSchema);
    const identity = adapter.identity(slotSchema);
    const cached = cache.get(identity);
    if (cached) return cached;
    const compiled = adapter.compile(slotSchema, slot);
    if (modelRef !== undefined) {
        compiled.modelRef = modelRef;
    }
    cache.set(identity, compiled);
    return compiled;
}

/**
 * Clears the shared cache (dev hot reload). The next compile pass repopulates
 * it wholesale (phase3 §5.10).
 */
export function clearValidatorCache(): void {
    validatorCache.clear();
}
