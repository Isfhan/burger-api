/**
 * Type-level inference from `schema.ts` method exports to `ctx.validated`.
 *
 * Pattern: in `route.ts`, type the handler parameter with the route's schema
 * export and `ctx.validated` becomes fully inferred:
 *
 * ```ts
 * // schema.ts
 * export const GET = { query: z.object({ q: z.string().optional() }) };
 *
 * // route.ts
 * import type { GET as RouteSchema } from './schema';
 * export async function GET(ctx: BurgerContext<typeof RouteSchema>) {
 *     ctx.validated.query; // { q?: string } | undefined
 * }
 * ```
 *
 * Types only — no runtime logic.
 */

import type { z } from 'zod';
import type { SchemaInput, StandardSchemaV1 } from '../validation/types';

/**
 * The shape of a per-method `schema.ts` export: one optional schema per
 * request slot.
 */
export interface RouteMethodSchema {
    params?: SchemaInput;
    query?: SchemaInput;
    headers?: SchemaInput;
    cookies?: SchemaInput;
    body?: SchemaInput;
}

/**
 * The validated output shape of a single schema. Zod infers the output type;
 * Standard Schema v1 validators use their `~standard.types.output` when
 * declared; anything else is `unknown`.
 */
export type InferSchemaOutput<T> = T extends z.ZodTypeAny
    ? z.infer<T>
    : T extends StandardSchemaV1
      ? T['~standard']['types'] extends { output: infer O }
          ? O
          : unknown
      : unknown;

/**
 * The fallback validated shape used when no inference applies. Mirrors the
 * `BurgerValidated` augmentation slots so augmentation remains the escape
 * hatch for anything inference cannot express.
 */
export interface DefaultValidated {
    params?: unknown;
    query?: unknown;
    headers?: unknown;
    cookies?: unknown;
    body?: unknown;
}

/**
 * The validated output of one schema slot value: an inline schema is
 * inferred; anything else is `unknown`.
 */
type SlotOutput<T> = T extends SchemaInput ? InferSchemaOutput<T> : unknown;

/**
 * A slot that is ALWAYS populated after validation when the route declares
 * it: `query`, `headers`, `cookies` are validated on every request (even an
 * empty query), and `params` whenever the route has `[param]` segments. The
 * declared slot is therefore non-optional — `ctx.validated.query.q` compiles
 * without optional chaining. Undeclared slots stay optional (`unknown`):
 * at runtime they are never set.
 */
type AlwaysSlot<TRoute, K extends keyof RouteMethodSchema> = K extends keyof TRoute
    ? { [P in K]: SlotOutput<TRoute[K]> }
    : { [P in K]?: unknown };

/**
 * A slot that may be absent even when declared: `body` is only validated for
 * JSON requests (`content-type: application/json`), so it stays optional.
 */
type MaybeSlot<TRoute, K extends keyof RouteMethodSchema> = K extends keyof TRoute
    ? { [P in K]?: SlotOutput<TRoute[K]> }
    : { [P in K]?: unknown };

/**
 * Map a `RouteMethodSchema` to its inferred `ctx.validated` shape.
 *
 * Declared `params`/`query`/`headers`/`cookies` slots are non-optional
 * (always populated after validation); `body` stays optional (JSON-only
 * gate); undeclared slots are optional `unknown`.
 */
export type InferValidated<TRoute> = TRoute extends object
    ? TRoute extends RouteMethodSchema
        ? AlwaysSlot<TRoute, 'params'> &
              AlwaysSlot<TRoute, 'query'> &
              AlwaysSlot<TRoute, 'headers'> &
              AlwaysSlot<TRoute, 'cookies'> &
              MaybeSlot<TRoute, 'body'>
        : DefaultValidated
    : DefaultValidated;
