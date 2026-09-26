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
import { UnauthorizedError, renderHTTPError } from "burger-api";

// All auth plugins declare `ctx.user` with the same type and merge their
// fields into `BurgerAuthUser`, so they can be installed together.
declare module "burger-api" {
  interface BurgerContext {
    /** The authenticated user, set by an auth plugin. */
    user?: BurgerAuthUser & Record<string, unknown>;
  }
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
 * Decode Base64 string
 */
function base64Decode(str: string): string {
  // Add padding if needed
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const normalized = padding ? padded + "=".repeat(4 - padding) : padded;
  return atob(normalized);
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
      transform: {
        user: (ctx: BurgerContext): BasicAuthUser | undefined => {
          const authHeader = ctx.headers.get(header);
          if (!authHeader) {
            return undefined;
          }

          // Scheme is case-insensitive (RFC 7617)
          if (!/^basic\s/i.test(authHeader)) {
            return undefined;
          }

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

          const username = decoded.slice(0, colonIndex);
          const password = decoded.slice(colonIndex + 1);

          // Mark for async validation
          (ctx as { _basicAuth?: { username: string; password: string } })._basicAuth = {
            username,
            password,
          };

          return undefined;
        },
      },

      beforeRoute: async (ctx: BurgerContext): Promise<Response | void> => {
        const config = ctx.config as { auth?: boolean | { required?: boolean } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Already validated in transform
        const user = ctx.user;
        if (user) {
          return;
        }

        const credentials = (ctx as { _basicAuth?: { username: string; password: string } })._basicAuth;
        if (!credentials) {
          return challenge("Missing Basic authentication");
        }

        const validatedUser = await validate(credentials.username, credentials.password);
        if (!validatedUser) {
          return challenge("Invalid credentials");
        }

        if (attachToContext) {
          ctx.user = validatedUser;
        }
      },
    },
  };

  /**
   * 401 with `WWW-Authenticate` so browsers show their login prompt. Returned
   * (not thrown) because thrown errors skip response hooks. Body is RFC 9457
   * problem+json, like the framework's own 401s.
   */
  function challenge(detail: string): Response {
    const response = renderHTTPError(new UnauthorizedError(detail), false);
    response.headers.set(
      "WWW-Authenticate",
      `Basic realm="${realm.replace(/["\\]/g, '\\$&')}", charset="UTF-8"`
    );
    return response;
  }
}
