/**
 * API Key Authentication Plugin for BurgerAPI
 *
 * Official API key authentication plugin that integrates with BurgerAPI's hook system.
 * Parses API key from header and validates against provided list or function.
 *
 * @example
 * ```typescript
 * import { Burger } from "burger-api";
 * import { apiKey } from "./ecosystem/plugins/api-key/api-key";
 *
 * const burger = new Burger();
 *
 * burger.usePlugin(apiKey({
 *   keys: ["key1", "key2"],
 * }));
 * ```
 */

import type { Plugin } from "burger-api/plugin/types";
import type { BurgerContext } from "burger-api/context/context";
import { UnauthorizedError } from "burger-api/errors/unauthorized";

/**
 * API key plugin configuration options
 */
export interface ApiKeyOptions {
  /**
   * Header name to extract API key from (default: "X-API-Key")
   */
  header?: string;

  /**
   * Static list of valid API keys
   */
  keys?: string[];

  /**
   * Dynamic validation function
   * @param key - API key to validate
   * @returns True if valid, false otherwise
   */
  validate?: (key: string) => Promise<boolean>;

  /**
   * Custom key extraction function
   * @param ctx - BurgerContext
   * @returns API key or null if not found
   */
  extract?: (ctx: BurgerContext) => string | null;

  /**
   * Whether to attach API key info to context (default: true)
   */
  attachToContext?: boolean;
}

/**
 * Create API key authentication plugin
 *
 * @param options - Plugin configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * // Static list
 * burger.usePlugin(apiKey({
 *   keys: ["key1", "key2", "key3"],
 * }));
 *
 * // Dynamic validation
 * burger.usePlugin(apiKey({
 *   validate: async (key) => {
 *     const dbKey = await db.apiKeys.findByKey(key);
 *     return dbKey !== null;
 *   },
 * }));
 * ```
 */
export function apiKey(options: ApiKeyOptions = {}): Plugin {
  const {
    header = "X-API-Key",
    keys = [],
    validate,
    extract,
    attachToContext = true,
  } = options;

  return {
    name: "api-key",

    hooks: {
      transform: {
        apiKey: (ctx: BurgerContext): string | undefined => {
          // Extract API key
          let apiKey: string | null;

          if (extract) {
            apiKey = extract(ctx);
          } else {
            apiKey = ctx.headers.get(header);
          }

          if (!apiKey) {
            return undefined;
          }

          // Validate against static list
          if (keys.length > 0 && keys.includes(apiKey)) {
            return apiKey;
          }

          // Mark as needing async validation
          (ctx as { _apiKeyToValidate?: string })._apiKeyToValidate = apiKey;
          return undefined;
        },
      },

      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        // Get config for this route
        const config = ctx.config as { auth?: boolean | { required?: boolean } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false) {
          return;
        }

        // Check if API key was already validated in transform
        const apiKey = (ctx as { apiKey?: string }).apiKey;
        if (apiKey) {
          return;
        }

        // Get API key to validate
        const keyToValidate = (ctx as { _apiKeyToValidate?: string })._apiKeyToValidate;
        if (!keyToValidate) {
          // No API key provided
          throw new UnauthorizedError("Missing API key");
        }

        // Validate with custom function
        if (validate) {
          const isValid = await validate(keyToValidate);
          if (!isValid) {
            throw new UnauthorizedError("Invalid API key");
          }

          // Attach to context if enabled
          if (attachToContext) {
            (ctx as { apiKey?: string }).apiKey = keyToValidate;
          }
        } else {
          // No validation function - already checked static list
          throw new UnauthorizedError("Invalid API key");
        }
      },
    },
  };
}
