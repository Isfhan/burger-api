/**
 * The schema preparation component — compiles a `RouteSchema` into
 * `CompiledRouteValidators`.
 *
 * Walks each slot, detects its adapter, computes identity, and consults the
 * cache; builds coercion plans and response validators when present. Runs
 * ONCE per route when it is set up (before `serve()`), never per request.
 * Identical schemas (by reference) share one cached validator.
 */

import type { RouteSchema, MethodSchema } from '../types/index.js';
import type { LowercaseHTTPMethod } from '../utils/routing.js';
import { ValidatorCache } from './cache.js';
import {
    detectAdapter,
    __setZodAdapter,
    __setStandardAdapter,
} from './adapter.js';
// Explicit adapter registration — value imports (not side-effect imports) so
// registration survives tree-shaking under `sideEffects: false`.
import { ZodAdapter } from './adapters/zod.js';
import { StandardAdapter } from './adapters/standard.js';
__setZodAdapter(ZodAdapter);
__setStandardAdapter(StandardAdapter);
import type {
    CompiledRouteValidators,
    CompiledValidator,
    SchemaInput,
    ValidationSlot,
    ValidatorConfig,
    CoercionPlan,
} from './types.js';
import { buildPlan as buildCoercionPlan } from './coerce.js';

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
    cache: ValidatorCache = validatorCache,
    route?: string
): CompiledRouteValidators {
    const methods: CompiledRouteValidators['methods'] = {};
    // `export const coerce = true` in schema.ts enables coercion for every
    // method in the file (a per-method `coerce` still works the same).
    const topLevelCoerce =
        (schema as { coerce?: unknown }).coerce === true;

    for (const rawMethod of Object.keys(schema)) {
        const method = rawMethod.toLowerCase();
        // The top-level `coerce` flag is not a method.
        if (method === 'coerce') continue;
        // Schema keys are typed as the method union; a module export is still
        // a runtime string, so index via the widened record.
        const m =
            (schema as Record<string, MethodSchema | undefined>)[
                rawMethod
            ] ?? {};
        const compiledMethod: CompiledRouteValidators['methods'][LowercaseHTTPMethod] =
            {};

        // Coercion is opt-in: app-level config.coerce, top-level schema
        // `coerce`, OR per-route schema[method].coerce override.
        const coerceEnabled =
            config.coerce === true || topLevelCoerce || m.coerce === true;

        for (const slot of REQUEST_SLOTS) {
            const raw = m[slot];
            if (raw === undefined) continue;
            if (slot === 'headers') {
                assertLowercaseHeaderKeys(raw, rawMethod.toUpperCase(), route);
            }
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
    const response = compileResponseSchemas(schema, cache, route);

    const result: CompiledRouteValidators = { methods };
    if (response) result.response = response;
    return result;
}

/**
 * Keys a schema exposes structurally (a Zod object's `.shape`, or a Standard
 * Schema value carrying a `shape` record). Opaque schemas (`records`, maps)
 * expose nothing, so they are skipped.
 */
function exposedShapeKeys(schema: SchemaInput): string[] | undefined {
    const shape = (schema as { shape?: unknown }).shape;
    if (shape === null || typeof shape !== 'object') return undefined;
    return Object.keys(shape);
}

/**
 * Header names are lowercased at runtime (`x-api-key`), so a schema key with
 * uppercase letters can never match. Fails startup naming the key and the
 * lowercase form. Only enforced when the schema exposes its keys structurally.
 */
function assertLowercaseHeaderKeys(
    schema: SchemaInput,
    method: string,
    route?: string
): void {
    const keys = exposedShapeKeys(schema);
    if (!keys) return;
    for (const key of keys) {
        const lower = key.toLowerCase();
        if (key !== lower) {
            throw new Error(
                `Header schema key "${key}" for ` +
                    `${method}${route ? ` ${route}` : ''} can never match: ` +
                    `header names are lowercased at runtime. Use "${lower}" instead.`
            );
        }
    }
}

/** An exact status code (`200`) — the selected form. */
const STATUS_CODE_KEY = /^[1-5]\d\d$/;
/** A status class (`2xx`) — the fallback form, lowercase only. */
const STATUS_CLASS_KEY = /^[1-5]xx$/;

/**
 * Compiles per-status `response` schemas into a map of `CompiledValidator`s.
 * Returns undefined when no `response` schemas are declared.
 *
 * A key that is neither a status code nor a lowercase status class can never
 * be selected at request time, so it fails startup naming the route, method
 * and key instead of silently never running.
 */
function compileResponseSchemas(
    schema: RouteSchema,
    cache: ValidatorCache,
    route?: string
): Record<string, Record<string, CompiledValidator>> | undefined {
    const response: Record<string, Record<string, CompiledValidator>> = {};
    let any = false;
    for (const rawMethod of Object.keys(schema)) {
        const method = rawMethod.toLowerCase();
        if (method === 'coerce') continue;
        const m =
            (schema as Record<string, MethodSchema | undefined>)[
                rawMethod
            ] ?? {};
        const responseSchemas = m.response;
        if (!responseSchemas) continue;
        const byStatus: Record<string, CompiledValidator> = {};
        for (const statusKey of Object.keys(responseSchemas)) {
            if (
                !STATUS_CODE_KEY.test(statusKey) &&
                !STATUS_CLASS_KEY.test(statusKey)
            ) {
                throw new Error(
                    `Invalid response schema key "${statusKey}" for ` +
                        `${rawMethod.toUpperCase()}${route ? ` ${route}` : ''}: ` +
                        'use a status code ("200") or a status class ("2xx").'
                );
            }
            byStatus[statusKey] = compileSlot(
                responseSchemas[statusKey]!,
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
    if (adapter.cacheable?.(slotSchema) === false) {
        // Semantics that the structural identity cannot capture (refinements,
        // self-coercion) — compile fresh so no other route can reuse this
        // validator's behavior.
        return adapter.compile(slotSchema, slot);
    }
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
