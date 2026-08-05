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
 * request slot. Model-string references (`"users/create"`) cannot be inferred
 * statically and fall back to `unknown`.
 */
export interface RouteMethodSchema {
    params?: SchemaInput | string;
    query?: SchemaInput | string;
    headers?: SchemaInput | string;
    cookies?: SchemaInput | string;
    body?: SchemaInput | string;
}

/**
 * The validated output shape of a single schema. Zod infers the output type;
 * Standard Schema v1 validators use their `~standard.types.output` when
 * declared; anything else (including model refs) is `unknown`.
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
 * Map a `RouteMethodSchema` to its inferred `ctx.validated` shape. Optional
 * slots stay optional; absent slots are `unknown`.
 */
export type InferValidated<TRoute> = TRoute extends object
    ? TRoute extends RouteMethodSchema
        ? {
              params?: TRoute['params'] extends SchemaInput
                  ? InferSchemaOutput<TRoute['params']>
                  : unknown;
              query?: TRoute['query'] extends SchemaInput
                  ? InferSchemaOutput<TRoute['query']>
                  : unknown;
              headers?: TRoute['headers'] extends SchemaInput
                  ? InferSchemaOutput<TRoute['headers']>
                  : unknown;
              cookies?: TRoute['cookies'] extends SchemaInput
                  ? InferSchemaOutput<TRoute['cookies']>
                  : unknown;
              body?: TRoute['body'] extends SchemaInput
                  ? InferSchemaOutput<TRoute['body']>
                  : unknown;
          }
        : DefaultValidated
    : DefaultValidated;
