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

import type { Plugin, BurgerContext } from "burger-api";
import { UnauthorizedError, timingSafeEqual } from "burger-api";

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
 * SHA-256 hex digest. Uses Bun's CryptoHasher when available, falling back
 * to WebCrypto for other runtimes.
 */
async function sha256Hex(input: string): Promise<string> {
  if (typeof Bun !== "undefined" && Bun.CryptoHasher) {
    try {
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(input);
      return hasher.digest("hex");
    } catch {
      // Fallback if CryptoHasher fails
    }
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
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

  // SHA-256 digests of the static keys, computed lazily. Comparison happens
  // on fixed-length digests with timingSafeEqual, so neither the match
  // position nor the key length is observable.
  let keyDigests: string[] | null = null;

  async function getKeyDigests(): Promise<string[]> {
    if (!keyDigests) {
      keyDigests = await Promise.all(keys.map(sha256Hex));
    }
    return keyDigests;
  }

  return {
    name: "api-key",

    hooks: {
      transform: {
        apiKey: async (ctx: BurgerContext): Promise<string | undefined> => {
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

          // Validate against the static list — compare every candidate
          // against every stored digest (no short-circuit on position or
          // prefix), then decide.
          const candidateDigest = await sha256Hex(apiKey);
          let matches = 0;
          for (const digest of await getKeyDigests()) {
            matches += timingSafeEqual(candidateDigest, digest) ? 1 : 0;
          }

          if (matches > 0) {
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
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
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
