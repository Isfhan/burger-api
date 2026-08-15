/**
 * The schema preparation component — the core of Validation 2.0
 *.
 *
 * Responsibilities:
 * - Walk a `RouteSchema` and prepare each slot into a `CompiledValidator`.
 * - Detect the adapter (connector) per slot; compute identity; consult the
 * cache.
 * - Build coercion plans and response validators when present.
 *
 * This runs ONCE per route when it is set up (before `serve()`). It never
 * executes when a request comes in and never throws on a per-request path
 *. Every schema is prepared a single time; identical
 * schemas (by reference) share one cached validator.
 */

import type { RouteSchema, RouteMethodValidation } from '../types/index';
import type { LowercaseHTTPMethod } from '../utils/routing';
import { ValidatorCache } from './cache';
import {
    detectAdapter,
    __setZodAdapter,
    __setStandardAdapter,
} from './adapter';
// Explicit adapter registration — value imports (not side-effect imports) so
// registration survives tree-shaking under `sideEffects: false`.
import { ZodAdapter } from './adapters/zod';
import { StandardAdapter } from './adapters/standard';
__setZodAdapter(ZodAdapter);
__setStandardAdapter(StandardAdapter);
import type {
    CompiledRouteValidators,
    CompiledValidator,
    SchemaInput,
    ValidationSlot,
    ValidatorConfig,
    CoercionPlan,
} from './types';
import { buildPlan as buildCoercionPlan } from './coerce';

/** The shared, process-lifetime validator cache. */
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
 * Compiles a route's `schema` into `CompiledRouteValidators`.
 *
 * @param schema - the raw route schema.
 * @param config - the validator configuration (coercion / response flags).
 * @param cache - the validator cache (shared instance by default).
 */
export function compileRouteSchema(
    schema: RouteSchema,
    config: ValidatorConfig = {},
    cache: ValidatorCache = validatorCache
): CompiledRouteValidators {
    const methods: CompiledRouteValidators['methods'] = {};

    for (const rawMethod of Object.keys(schema)) {
        const method = rawMethod.toLowerCase();
        // Schema keys are typed as the method union; a module export is still
        // a runtime string, so index via the widened record.
        const m =
            (schema as Record<string, RouteMethodValidation | undefined>)[
                rawMethod
            ] ?? {};
        const compiledMethod: CompiledRouteValidators['methods'][LowercaseHTTPMethod] =
            {};

        // Coercion is opt-in: app-level config.coerce OR per-route
        // schema[method].coerce override.
        const coerceEnabled =
            config.coerce === true || m.coerce === true;

        for (const slot of REQUEST_SLOTS) {
            const raw = m[slot];
            if (raw === undefined) continue;
            compiledMethod[slot] = compileSlot(raw, slot, cache);
        }

        // Build coercion plans only when coercion is enabled.
        if (coerceEnabled) {
            const coercion: NonNullable<
                CompiledRouteValidators['methods'][LowercaseHTTPMethod]
            >['coercion'] = {};
            for (const slot of [
                'query',
                'params',
                'headers',
                'cookies',
            ] as const) {
                const raw = m[slot];
                if (raw === undefined) continue;
                // Self-coercing schemas (e.g. z.coerce.* / ~standard.coercible)
                // transform their own input — framework coercion must not run.
                if (compiledMethod[slot]?.coercible) continue;
                const plan: CoercionPlan | undefined = buildCoercionPlan(
                    raw,
                    slot
                );
                if (plan) coercion[slot] = plan;
            }
            if (Object.keys(coercion).length > 0) {
                compiledMethod.coercion = coercion;
            }
        }

        // Method keys are lowercased at runtime before storage; the compiled
        // map is union-keyed, so write via the widened record.
        (methods as Record<string, typeof compiledMethod>)[method] =
            compiledMethod;
    }

    // Compile response schemas (per-status) when present.
    const response = compileResponseSchemas(schema, cache);

    const result: CompiledRouteValidators = { methods };
    if (response) result.response = response;
    return result;
}

/**
 * Compiles per-status `response` schemas into a map of `CompiledValidator`s.
 * Returns undefined when no `response` schemas are declared.
 */
function compileResponseSchemas(
    schema: RouteSchema,
    cache: ValidatorCache
): Record<string, Record<string, CompiledValidator>> | undefined {
    const response: Record<string, Record<string, CompiledValidator>> = {};
    let any = false;
    for (const rawMethod of Object.keys(schema)) {
        const method = rawMethod.toLowerCase();
        const m =
            (schema as Record<string, RouteMethodValidation | undefined>)[
                rawMethod
            ] ?? {};
        const responseSchemas = m.response;
        if (!responseSchemas) continue;
        const byStatus: Record<string, CompiledValidator> = {};
        for (const statusKey of Object.keys(responseSchemas)) {
            byStatus[statusKey] = compileSlot(
                responseSchemas[statusKey],
                'body',
                cache
            );
            any = true;
        }
        response[method] = byStatus;
    }
    return any ? response : undefined;
}

/**
 * Compiles a single slot schema into a `CompiledValidator`, consulting the
 * cache by identity first.
 */
function compileSlot(
    slotSchema: SchemaInput,
    slot: ValidationSlot,
    cache: ValidatorCache
): CompiledValidator {
    const adapter = detectAdapter(slotSchema);
    const identity = adapter.identity(slotSchema);
    const cached = cache.get(identity);
    if (cached) return cached;
    const compiled = adapter.compile(slotSchema, slot);
    cache.set(identity, compiled);
    return compiled;
}

/**
 * Clears the shared cache (dev hot reload). The next compile pass repopulates
 * it wholesale.
 */
export function clearValidatorCache(): void {
    validatorCache.clear();
}
