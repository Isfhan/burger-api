/**
 * API Key Authentication Plugin for BurgerAPI
 *
 * Reads the API key from a header and validates it against a static list or
 * a `validate` function.
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
import { UnauthorizedError, ForbiddenError, timingSafeEqual } from "burger-api";

declare module "burger-api" {
  interface BurgerContext {
    /** The validated API key, set by the api-key plugin. */
    apiKey?: string;
  }
}

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
 * to WebCrypto.
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

  // No keys and no validator would 401 every request — fail at startup
  // instead of silently locking the API.
  if (keys.length === 0 && typeof validate !== "function") {
    throw new Error(
      "[burger-api/plugin-api-key] apiKey() requires a non-empty `keys` array " +
        "or a `validate(key)` function, e.g. apiKey({ keys: ['...'] })."
    );
  }

  // Digests of the static keys, computed lazily. Comparing fixed-length
  // digests keeps match position and key length unobservable.
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
      // Authentication runs in `transform`: after routing (so `ctx.config` is
      // known) but before validation and body parsing. An unauthenticated
      // request is rejected with 401 before it can receive a 422/400 that
      // reveals the schema or parses its body. Rejections are thrown
      // HTTPErrors, rendered by `onError` like any other error.
      transform: {
        apiKey: async (ctx: BurgerContext): Promise<string | undefined> => {
          const config = ctx.config as
            | { auth?: boolean | { required?: boolean; roles?: string[] } }
            | undefined;

          // Skip auth check if explicitly disabled.
          if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
            return undefined;
          }

          let apiKey: string | null;

          if (extract) {
            apiKey = extract(ctx);
          } else {
            apiKey = ctx.headers.get(header);
          }

          if (!apiKey) {
            throw new UnauthorizedError("Missing API key");
          }

          // Compare against every stored digest with no short-circuit.
          const candidateDigest = await sha256Hex(apiKey);
          let matches = 0;
          for (const digest of await getKeyDigests()) {
            matches += timingSafeEqual(candidateDigest, digest) ? 1 : 0;
          }

          let keyToAttach: string | undefined;

          if (matches > 0) {
            // Static-list keys always attach, even with attachToContext off.
            keyToAttach = apiKey;
          } else {
            if (!validate) {
              // No validator configured: the static list did not match.
              throw new UnauthorizedError("Invalid API key");
            }

            const isValid = await validate(apiKey);
            if (!isValid) {
              throw new UnauthorizedError("Invalid API key");
            }

            if (attachToContext) {
              keyToAttach = apiKey;
            }
          }

          // An API key has no roles: a route that lists roles must fail closed.
          const requiredRoles =
            config?.auth && typeof config.auth === "object" ? config.auth.roles : undefined;
          if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
            throw new ForbiddenError("Insufficient permissions");
          }

          return keyToAttach;
        },
      },
    },
  };
}
