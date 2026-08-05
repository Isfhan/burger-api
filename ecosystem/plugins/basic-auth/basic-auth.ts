/**
 * Basic Authentication Plugin for BurgerAPI
 *
 * Official HTTP Basic authentication plugin that integrates with BurgerAPI's hook system.
 * Parses Basic auth header, decodes credentials, and validates against provided function.
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
import { UnauthorizedError } from "burger-api";

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
 * // Basic usage
 * burger.usePlugin(basicAuth({
 *   validate: async (username, password) => {
 *     const user = await db.users.findByUsername(username);
 *     if (user && user.password === password) {
 *       return { id: user.id, username: user.username, roles: user.roles };
 *     }
 *     return null;
 *   },
 * }));
 * ```
 */
export function basicAuth(options: BasicAuthOptions): Plugin {
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
          // Extract Basic auth header
          const authHeader = ctx.headers.get(header);
          if (!authHeader) {
            return undefined;
          }

          // Check prefix
          if (!authHeader.startsWith("Basic ")) {
            return undefined;
          }

          // Decode Base64 credentials
          const encoded = authHeader.slice(6);
          let decoded: string;
          try {
            decoded = base64Decode(encoded);
          } catch {
            return undefined;
          }

          // Split username:password
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

      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        // Get config for this route
        const config = ctx.config as { auth?: boolean | { required?: boolean } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Check if user was already validated in transform
        const user = (ctx as { user?: BasicAuthUser }).user;
        if (user) {
          return;
        }

        // Get credentials to validate
        const credentials = (ctx as { _basicAuth?: { username: string; password: string } })._basicAuth;
        if (!credentials) {
          // No Basic auth provided
          throw new UnauthorizedError("Missing Basic authentication");
        }

        // Validate credentials
        const validatedUser = await validate(credentials.username, credentials.password);
        if (!validatedUser) {
          throw new UnauthorizedError("Invalid credentials");
        }

        // Attach user to context if enabled
        if (attachToContext) {
          (ctx as { user?: BasicAuthUser }).user = validatedUser;
        }
      },

      mapResponse: (ctx: BurgerContext): ((response: Response) => Response) => {
        // 1.0 contract: response hooks return a transform function;
        // the framework applies it to the response. (Legacy two-arg form is
        // not supported by the pipeline.)
        return (response: Response) => {
          // Check if we need to add WWW-Authenticate header
          const user = (ctx as { user?: BasicAuthUser }).user;
          if (!user) {
            // Add WWW-Authenticate header for 401 responses
            const newResponse = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
            newResponse.headers.set(
              "WWW-Authenticate",
              `Basic realm="${realm}"`
            );
            return newResponse;
          }
          return response;
        };
      },
    },
  };
}
