/**
 * Basic Authentication Plugin for BurgerAPI
 *
 * Decodes the HTTP Basic header and validates credentials with the provided
 * function.
 *
 * @example
 * ```typescript
 * import { Burger } from "burger-api";
 * import { basicAuth } from "./ecosystem/plugins/basic-auth/basic-auth";
 *
 * const burger = new Burger();
 *
 * burger.usePlugin(basicAuth({
 *   validate: async (username, password) => {
 *     // Check against database
 *     return { id: "123", username, role: "user" };
 *   },
 * }));
 * ```
 */

import type { Plugin, BurgerContext } from "burger-api";
import { UnauthorizedError, ForbiddenError } from "burger-api";

// All auth plugins merge their fields into `BurgerAuthUser`, the shared
// augmentation point for `ctx.user` / `ws.user`, so they can be installed
// together.
declare module "burger-api" {
  interface BurgerAuthUser {
    /** User ID (basic-auth) */
    id?: string;
    /** Username (basic-auth) */
    username?: string;
    /** User roles */
    roles?: string[];
  }
}

/**
 * Basic auth validation result
 */
export interface BasicAuthUser {
  /**
   * User ID
   */
  id: string;

  /**
   * Username
   */
  username: string;

  /**
   * User roles
   */
  roles?: string[];

  /**
   * Additional user data
   */
  [key: string]: unknown;
}

/**
 * Basic auth plugin configuration options
 */
export interface BasicAuthOptions {
  /**
   * Header name to extract Basic auth from (default: "Authorization")
   */
  header?: string;

  /**
   * Validation function
   * @param username - Username from auth header
   * @param password - Password from auth header
   * @returns User object if valid, null if invalid
   */
  validate: (username: string, password: string) => Promise<BasicAuthUser | null>;

  /**
   * Whether to attach user info to context (default: true)
   */
  attachToContext?: boolean;

  /**
   * Custom realm for WWW-Authenticate header (default: "Restricted")
   */
  realm?: string;
}

/**
 * Decode Base64 credentials as UTF-8 (the charset the challenge advertises).
 * Throws on malformed base64.
 */
function base64Decode(str: string): string {
  // Add padding if needed
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const normalized = padding ? padded + "=".repeat(4 - padding) : padded;
  return new TextDecoder().decode(
    Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0))
  );
}

/**
 * Create Basic authentication plugin
 *
 * @param options - Plugin configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * // Basic usage — compare credentials with a timing-safe comparison.
 * // Never compare passwords with `===` (timing side channel).
 * import { timingSafeEqual } from "burger-api";
 *
 * burger.usePlugin(basicAuth({
 *   validate: async (username, password) => {
 *     const user = await db.users.findByUsername(username);
 *     if (user && timingSafeEqual(user.password, password)) {
 *       return { id: user.id, username: user.username, roles: user.roles };
 *     }
 *     return null;
 *   },
 * }));
 * ```
 */
export function basicAuth(options: BasicAuthOptions): Plugin {
  if (typeof options?.validate !== "function") {
    throw new Error(
      "[burger-api/plugin-basic-auth] basicAuth() requires a `validate(username, password)` option " +
        "that returns the user object or null, e.g. basicAuth({ validate: async (u, p) => ... })."
    );
  }

  const {
    header = "Authorization",
    validate,
    attachToContext = true,
    realm = "Restricted",
  } = options;

  return {
    name: "basic-auth",

    hooks: {
      // Authentication runs in `transform`: after routing (so `ctx.config` is
      // known) but before validation and body parsing. An unauthenticated
      // request is rejected with 401 before it can receive a 422/400 that
      // reveals the schema or parses its body. Rejections are thrown
      // HTTPErrors, rendered by `onError` like any other error.
      transform: {
        user: async (ctx: BurgerContext): Promise<BasicAuthUser | undefined> => {
          const config = ctx.config as
            | { auth?: boolean | { required?: boolean; roles?: string[] } }
            | undefined;

          // Skip auth check if explicitly disabled.
          if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
            return undefined;
          }

          const authHeader = ctx.headers.get(header);

          // Scheme is case-insensitive (RFC 7617)
          const credentials =
            authHeader && /^basic\s/i.test(authHeader)
              ? parseCredentials(authHeader)
              : undefined;

          if (!credentials) {
            throw challenge("Missing Basic authentication");
          }

          const validatedUser = await validate(
            credentials.username,
            credentials.password
          );
          if (!validatedUser) {
            throw challenge("Invalid credentials");
          }

          assertRoles(config, validatedUser);

          return attachToContext ? validatedUser : undefined;
        },
      },
    },
  };

  /**
   * 401 with `WWW-Authenticate` so browsers show their login prompt. Thrown
   * (not returned) so the framework renders it as RFC 9457 problem+json and
   * still runs the response hooks (`onError` etc.).
   */
  function challenge(detail: string): UnauthorizedError {
    return new UnauthorizedError(detail, {
      headers: {
        "WWW-Authenticate": `Basic realm="${realm.replace(/["\\]/g, '\\$&')}", charset="UTF-8"`,
      },
    });
  }
}

/**
 * Decode `Basic <base64>` into credentials. Returns `undefined` for malformed
 * base64 or a decoded value without a colon.
 */
function parseCredentials(
  authHeader: string
): { username: string; password: string } | undefined {
  const encoded = authHeader.slice(6).trim();
  let decoded: string;
  try {
    decoded = base64Decode(encoded);
  } catch {
    return undefined;
  }

  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) {
    return undefined;
  }

  return {
    username: decoded.slice(0, colonIndex),
    password: decoded.slice(colonIndex + 1),
  };
}

/**
 * Enforce a route's `config.auth.roles`. A non-array user `roles` value counts
 * as no roles, so a string claim can never match by substring.
 */
function assertRoles(
  config: { auth?: boolean | { required?: boolean; roles?: string[] } } | undefined,
  user: unknown
): void {
  const requiredRoles = config?.auth && typeof config.auth === "object" ? config.auth.roles : undefined;

  // An empty (or non-array) list means no role is required.
  if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
    return;
  }

  const claim = (user as { roles?: unknown } | undefined)?.roles;
  const userRoles: unknown[] = Array.isArray(claim) ? claim : [];
  const hasRole = requiredRoles.some((role) => userRoles.includes(role));

  if (!hasRole) {
    throw new ForbiddenError("Insufficient permissions");
  }
}
