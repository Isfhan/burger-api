/**
 * JWT Authentication Plugin for BurgerAPI
 *
 * Official JWT authentication plugin that integrates with BurgerAPI's hook system.
 * Parses JWT from Authorization header, verifies signature, and attaches decoded
 * payload to context.
 *
 * @example
 * ```typescript
 * import { Burger } from "burger-api";
 * import { jwtAuth } from "./ecosystem/plugins/jwt-auth/jwt-auth";
 *
 * const burger = new Burger();
 *
 * burger.usePlugin(jwtAuth({
 *   secret: process.env.JWT_SECRET,
 *   algorithm: "HS256",
 * }));
 * ```
 */

import type { Plugin, BurgerContext } from "burger-api";
import { UnauthorizedError, ForbiddenError } from "burger-api";

/**
 * JWT plugin configuration options
 */
export interface JwtAuthOptions {
  /**
   * Secret key for HMAC algorithms (HS256, HS384, HS512)
   * For RS256/ES256, provide a CryptoKey via `publicKey`
   */
  secret?: string | CryptoKey;

  /**
   * Public key for asymmetric algorithms (RS256, ES256, etc.)
   * Use when verifying tokens signed with private keys
   */
  publicKey?: CryptoKey;

  /**
   * JWT signing algorithm (default: HS256)
   */
  algorithm?: "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";

  /**
   * Header name to extract token from (default: "Authorization")
   */
  header?: string;

  /**
   * Token prefix (default: "Bearer")
   */
  prefix?: string;

  /**
   * Required issuer claim
   */
  issuer?: string;

  /**
   * Required audience claim
   */
  audience?: string;

  /**
   * Clock tolerance in seconds for expiration checks (default: 0)
   */
  clockTolerance?: number;

  /**
   * Require an `exp` claim on every token (default: true).
   * Tokens without an expiration are rejected when enabled.
   */
  requireExpiration?: boolean;
}

/**
 * JWT payload structure (standard claims)
 */
export interface JwtPayload {
  /** Subject (user ID) */
  sub?: string;
  /** Issuer */
  iss?: string;
  /** Audience */
  aud?: string | string[];
  /** Expiration time (seconds since epoch) */
  exp?: number;
  /** Not before time (seconds since epoch) */
  nbf?: number;
  /** Issued at time (seconds since epoch) */
  iat?: number;
  /** JWT ID */
  jti?: string;
  /** Custom claims */
  [key: string]: unknown;
}

/**
 * Map algorithm string to Web Crypto algorithm name. The algorithm type is
 * derived from the platform (`crypto.subtle.importKey`) so the plugin
 * compiles without the DOM lib (scaffold tsconfigs use `lib: ["ESNext"]`).
 */
type ImportKeyAlgorithm = NonNullable<Parameters<typeof crypto.subtle.importKey>[2]>;
function getAlgorithmName(
    algorithm: string
): ImportKeyAlgorithm {
  switch (algorithm) {
    case "HS256":
      return { name: "HMAC", hash: "SHA-256" } as ImportKeyAlgorithm;
    case "HS384":
      return { name: "HMAC", hash: "SHA-384" };
    case "HS512":
      return { name: "HMAC", hash: "SHA-512" };
    case "RS256":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    case "RS384":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" };
    case "RS512":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
    case "ES256":
      return { name: "ECDSA", namedCurve: "P-256" };
    case "ES384":
      return { name: "ECDSA", namedCurve: "P-384" };
    case "ES512":
      return { name: "ECDSA", namedCurve: "P-521" };
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  // Add padding if needed
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const normalized = padding ? padded + "=".repeat(4 - padding) : padded;
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

/**
 * Verify JWT signature using Web Crypto API
 */
async function verifySignature(
  token: string,
  key: string | CryptoKey,
  algorithm: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) {
    throw new Error("Malformed JWT: expected three dot-separated parts");
  }
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const signatureBytes = base64UrlDecode(signature);

  let cryptoKey: CryptoKey;

  if (typeof key === "string") {
    // Import string secret as HMAC key
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      getAlgorithmName(algorithm),
      false,
      ["verify"]
    );
  } else {
    // Use provided CryptoKey directly
    cryptoKey = key;
  }

  return crypto.subtle.verify(
    getAlgorithmName(algorithm),
    cryptoKey,
    signatureBytes,
    data
  );
}

/**
 * Create JWT authentication plugin
 *
 * @param options - Plugin configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * // Basic usage with HMAC
 * burger.usePlugin(jwtAuth({
 *   secret: process.env.JWT_SECRET,
 * }));
 *
 * // With RS256
 * const privateKey = await crypto.subtle.importKey(...);
 * burger.usePlugin(jwtAuth({
 *   publicKey: publicKey,
 *   algorithm: "RS256",
 * }));
 * ```
 */
export function jwtAuth(options: JwtAuthOptions = {}): Plugin {
  const {
    secret,
    publicKey,
    algorithm = "HS256",
    header = "Authorization",
    prefix = "Bearer",
    issuer,
    audience,
    clockTolerance = 0,
    requireExpiration = true,
  } = options;

  // Determine the verification key
  const verificationKey = publicKey ?? secret;

  if (!verificationKey) {
    throw new Error("JWT plugin requires either `secret` or `publicKey` option");
  }

  // HMAC secrets shorter than 32 bytes are trivially brute-forced — fail
  // loud at startup instead of at runtime.
  if (
    algorithm.startsWith("HS") &&
    typeof secret === "string" &&
    secret.length < 32
  ) {
    throw new Error(
      `JWT plugin: HMAC secret must be at least 32 bytes long (got ${secret.length} bytes)`
    );
  }

  return {
    name: "jwt-auth",

    hooks: {
      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        // Get config for this route
        const config = ctx.config as { auth?: boolean | { required?: boolean; roles?: string[] } } | undefined;

        // Skip auth check if explicitly disabled.
        // Note: the token is NOT parsed or attached to ctx.user here —
        // unverified claims never reach auth-disabled routes.
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Consistent token extraction — the prefix must match exactly.
        const authHeader = ctx.headers.get(header);
        if (!authHeader?.startsWith(`${prefix} `)) {
          throw new UnauthorizedError("Missing or invalid token");
        }
        const token = authHeader.slice(prefix.length + 1);

        const parts = token.split(".");
        if (parts.length !== 3) {
          throw new UnauthorizedError("Malformed token");
        }
        // The length-3 guard above guarantees both parts; destructure so
        // noUncheckedIndexedAccess narrows them to strings.
        const [encodedHeader, encodedPayload, signature] = parts;
        if (!encodedHeader || !encodedPayload || !signature) {
          throw new UnauthorizedError("Malformed token");
        }

        let user: JwtPayload;
        try {
          // Check the header's alg claim before verifying — a token that
          // claims a different algorithm than configured must never be
          // verified with the configured key.
          const headerDecoded = JSON.parse(
            new TextDecoder().decode(base64UrlDecode(encodedHeader))
          ) as { alg?: unknown };

          if (headerDecoded.alg !== algorithm) {
            throw new UnauthorizedError("Invalid token algorithm");
          }

          const signatureValid = await verifySignature(token, verificationKey, algorithm);
          if (!signatureValid) {
            throw new UnauthorizedError("Invalid token signature");
          }

          // Only after the signature verifies may the payload be trusted.
          user = JSON.parse(
            new TextDecoder().decode(base64UrlDecode(encodedPayload))
          ) as JwtPayload;
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            throw error;
          }
          throw new UnauthorizedError("Malformed token");
        }

        // Check expiration — reject early rather than risk a non-finite value
        // passing the comparison.
        const now = Math.floor(Date.now() / 1000);
        if (user.exp === undefined) {
          if (requireExpiration) {
            throw new UnauthorizedError("Token has no expiration");
          }
        } else {
          if (typeof user.exp !== "number" || !Number.isFinite(user.exp)) {
            throw new UnauthorizedError("Token has invalid expiration");
          }
          // Strict: `exp == now` is already expired.
          if (user.exp <= now - clockTolerance) {
            throw new UnauthorizedError("Token expired");
          }
        }

        // Check not-before
        if (user.nbf !== undefined) {
          if (typeof user.nbf !== "number" || !Number.isFinite(user.nbf)) {
            throw new UnauthorizedError("Token has invalid not-before claim");
          }
          if (user.nbf > now + clockTolerance) {
            throw new UnauthorizedError("Token not yet valid");
          }
        }

        // Check issuer (a configured issuer must match exactly)
        if (issuer && user.iss !== issuer) {
          throw new UnauthorizedError("Invalid issuer");
        }

        // Check audience — a configured audience must be present AND listed
        if (audience) {
          if (!user.aud) {
            throw new UnauthorizedError("Invalid audience");
          }
          const audArray = Array.isArray(user.aud) ? user.aud : [user.aud];
          if (!audArray.includes(audience)) {
            throw new UnauthorizedError("Invalid audience");
          }
        }

        // Check roles if required
        if (config?.auth && typeof config.auth === "object" && config.auth.roles) {
          const userRoles = (user as { roles?: string[] }).roles ?? [];
          const requiredRoles = config.auth.roles;
          const hasRole = requiredRoles.some((role) => userRoles.includes(role));

          if (!hasRole) {
            throw new ForbiddenError("Insufficient permissions");
          }
        }

        // Attach verified claims only — handlers and response hooks on this
        // route can trust ctx.user.
        (ctx as { user?: JwtPayload }).user = user;
      },
    },
  };
}
