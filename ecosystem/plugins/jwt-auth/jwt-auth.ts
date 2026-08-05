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
 * Map algorithm string to Web Crypto algorithm name
 */
function getAlgorithmName(algorithm: string): AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams {
  switch (algorithm) {
    case "HS256":
      return { name: "HMAC", hash: "SHA-256" };
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
function base64UrlDecode(str: string): Uint8Array {
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
  } = options;

  // Determine the verification key
  const verificationKey = publicKey ?? secret;

  if (!verificationKey) {
    throw new Error("JWT plugin requires either `secret` or `publicKey` option");
  }

  return {
    name: "jwt-auth",

    hooks: {
      transform: {
        user: (ctx: BurgerContext): JwtPayload | undefined => {
          // Extract token from header
          const authHeader = ctx.headers.get(header);
          if (!authHeader) {
            return undefined;
          }

          // Check prefix
          if (!authHeader.startsWith(`${prefix} `)) {
            return undefined;
          }

          const token = authHeader.slice(prefix.length + 1);

          // Decode header to get algorithm
          const headerParts = token.split(".");
          if (headerParts.length !== 3) {
            return undefined;
          }

          try {
            const headerDecoded = JSON.parse(
              new TextDecoder().decode(base64UrlDecode(headerParts[0]))
            );

            // Verify algorithm matches
            if (headerDecoded.alg !== algorithm) {
              return undefined;
            }

            // Verify signature synchronously (Web Crypto is async, but we'll handle in beforeRoute)
            // For now, decode payload without verification
            const payload = JSON.parse(
              new TextDecoder().decode(base64UrlDecode(headerParts[1]))
            );

            return payload as JwtPayload;
          } catch {
            return undefined;
          }
        },
      },

      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        // Get config for this route
        const config = ctx.config as { auth?: boolean | { required?: boolean; roles?: string[] } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Get user from transform
        const user = (ctx as { user?: JwtPayload }).user;
        if (!user) {
          // No user attached - auth failed
          throw new UnauthorizedError("Missing or invalid token");
        }

        // Verify signature
        const authHeader = ctx.headers.get(header);
        const token = authHeader?.slice(prefix.length + 1);

        if (!token) {
          throw new UnauthorizedError("Missing token");
        }

        const isValid = await verifySignature(token, verificationKey, algorithm);
        if (!isValid) {
          throw new UnauthorizedError("Invalid token signature");
        }

        // Check expiration
        if (user.exp !== undefined) {
          const now = Math.floor(Date.now() / 1000);
          if (user.exp < now - clockTolerance) {
            throw new UnauthorizedError("Token expired");
          }
        }

        // Check not-before
        if (user.nbf !== undefined) {
          const now = Math.floor(Date.now() / 1000);
          if (user.nbf > now + clockTolerance) {
            throw new UnauthorizedError("Token not yet valid");
          }
        }

        // Check issuer
        if (issuer && user.iss !== issuer) {
          throw new UnauthorizedError("Invalid issuer");
        }

        // Check audience
        if (audience && user.aud) {
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
      },
    },
  };
}
