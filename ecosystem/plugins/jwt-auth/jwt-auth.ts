/**
 * JWT Authentication Plugin for BurgerAPI
 *
 * Verifies a JWT from the Authorization header and attaches its claims to the
 * context.
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

// All auth plugins merge their fields into `BurgerAuthUser`, the shared
// augmentation point for `ctx.user` / `ws.user`, so they can be installed
// together.
declare module "burger-api" {
  interface BurgerAuthUser {
    /** Subject (user ID) */
    sub?: string;
    /** Issuer */
    iss?: string;
    /** Audience */
    aud?: string | string[];
    /** Expiration time (seconds since epoch) */
    exp?: number;
    /** Not-before time (seconds since epoch) */
    nbf?: number;
    /** Issued-at time (seconds since epoch) */
    iat?: number;
    /** JWT ID */
    jti?: string;
    /** User roles */
    roles?: string[];
  }
}

/** Algorithms the plugin verifies and `signJwt` signs. */
export type JwtAlgorithm =
  | "HS256"
  | "HS384"
  | "HS512"
  | "RS256"
  | "RS384"
  | "RS512"
  | "ES256"
  | "ES384"
  | "ES512";

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
  algorithm?: JwtAlgorithm;

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
 * Map an algorithm name to its Web Crypto parameters. The types are derived
 * from the platform so this compiles without the DOM lib. Key import wants
 * `namedCurve` for ECDSA; sign/verify want `hash` instead — passing the
 * import params to sign/verify is what broke the ES algorithms.
 */
type ImportKeyAlgorithm = NonNullable<Parameters<typeof crypto.subtle.importKey>[2]>;
type SignVerifyAlgorithm = Parameters<typeof crypto.subtle.sign>[0];

function getImportAlgorithm(algorithm: string): ImportKeyAlgorithm {
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

function getSignVerifyAlgorithm(algorithm: string): SignVerifyAlgorithm {
  switch (algorithm) {
    case "HS256":
      return { name: "HMAC", hash: "SHA-256" } as SignVerifyAlgorithm;
    case "HS384":
      return { name: "HMAC", hash: "SHA-384" } as SignVerifyAlgorithm;
    case "HS512":
      return { name: "HMAC", hash: "SHA-512" } as SignVerifyAlgorithm;
    case "RS256":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as SignVerifyAlgorithm;
    case "RS384":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" } as SignVerifyAlgorithm;
    case "RS512":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" } as SignVerifyAlgorithm;
    case "ES256":
      return { name: "ECDSA", hash: "SHA-256" } as SignVerifyAlgorithm;
    case "ES384":
      return { name: "ECDSA", hash: "SHA-384" } as SignVerifyAlgorithm;
    case "ES512":
      return { name: "ECDSA", hash: "SHA-512" } as SignVerifyAlgorithm;
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}

/** True for algorithms that need an asymmetric key pair instead of a secret. */
function isAsymmetric(algorithm: string): boolean {
  return algorithm.startsWith("RS") || algorithm.startsWith("ES");
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
 * Base64 URL encode (no padding)
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
    // Raw string secret: import as an HMAC key.
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      getImportAlgorithm(algorithm),
      false,
      ["verify"]
    );
  } else {
    cryptoKey = key;
  }

  return crypto.subtle.verify(
    getSignVerifyAlgorithm(algorithm),
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

  const verificationKey = publicKey ?? secret;

  if (!verificationKey) {
    throw new Error("JWT plugin requires either `secret` or `publicKey` option");
  }

  // RS/ES verify with an asymmetric public key. A `secret` here would import
  // as HMAC and fail every request with a 401 — reject it at startup instead.
  if (isAsymmetric(algorithm) && !publicKey) {
    throw new Error(
      `JWT plugin: algorithm ${algorithm} requires a \`publicKey\` CryptoKey option. ` +
        "`secret` only works with the HMAC algorithms (HS256, HS384, HS512)."
    );
  }

  // HMAC secrets under 32 bytes are trivially brute-forced — fail at startup.
  if (
    algorithm.startsWith("HS") &&
    typeof secret === "string" &&
    secret.length < 32
  ) {
    throw new Error(
      `JWT plugin: HMAC secret must be at least 32 bytes long (got ${secret.length} bytes). ` +
        "Generate one with `openssl rand -base64 32` and load it from an environment variable."
    );
  }

  return {
    name: "jwt-auth",

    hooks: {
      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        const config = ctx.config as { auth?: boolean | { required?: boolean; roles?: string[] } } | undefined;

        // Skip auth check if explicitly disabled. The token is not parsed
        // here — unverified claims never reach auth-disabled routes.
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // The prefix must match exactly.
        const authHeader = ctx.headers.get(header);
        if (!authHeader?.startsWith(`${prefix} `)) {
          throw new UnauthorizedError("Missing or invalid token");
        }
        const token = authHeader.slice(prefix.length + 1);

        const parts = token.split(".");
        if (parts.length !== 3) {
          throw new UnauthorizedError("Malformed token");
        }
        // Destructure so noUncheckedIndexedAccess narrows the parts to strings.
        const [encodedHeader, encodedPayload, signature] = parts;
        if (!encodedHeader || !encodedPayload || !signature) {
          throw new UnauthorizedError("Malformed token");
        }

        let user: JwtPayload;
        try {
          // Reject tokens whose `alg` differs from the configured one —
          // never verify with the wrong key.
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

        // Check expiration; reject non-finite values before comparing.
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

        if (user.nbf !== undefined) {
          if (typeof user.nbf !== "number" || !Number.isFinite(user.nbf)) {
            throw new UnauthorizedError("Token has invalid not-before claim");
          }
          if (user.nbf > now + clockTolerance) {
            throw new UnauthorizedError("Token not yet valid");
          }
        }

        // A configured issuer must match exactly.
        if (issuer && user.iss !== issuer) {
          throw new UnauthorizedError("Invalid issuer");
        }

        // A configured audience must be present and listed.
        if (audience) {
          if (!user.aud) {
            throw new UnauthorizedError("Invalid audience");
          }
          const audArray = Array.isArray(user.aud) ? user.aud : [user.aud];
          if (!audArray.includes(audience)) {
            throw new UnauthorizedError("Invalid audience");
          }
        }

        if (config?.auth && typeof config.auth === "object" && config.auth.roles) {
          const userRoles = (user as { roles?: string[] }).roles ?? [];
          const requiredRoles = config.auth.roles;
          const hasRole = requiredRoles.some((role) => userRoles.includes(role));

          if (!hasRole) {
            throw new ForbiddenError("Insufficient permissions");
          }
        }

        // Attach verified claims only, so handlers can trust ctx.user.
        (ctx as { user?: JwtPayload }).user = user;
      },
    },
  };
}

/**
 * Options for {@link signJwt}
 */
export interface SignJwtOptions {
  /**
   * Secret key for HMAC algorithms (HS256, HS384, HS512).
   * Must be at least 32 bytes, the same minimum the plugin enforces.
   */
  secret?: string | CryptoKey;

  /**
   * Private key for asymmetric algorithms (RS256, ES256, ...).
   * The plugin verifies with the matching public key.
   */
  privateKey?: CryptoKey;

  /**
   * Signing algorithm (default: HS256). Use the same algorithm the plugin
   * is configured with.
   */
  algorithm?: JwtAlgorithm;

  /**
   * Token lifetime in seconds. Sets `exp` to now + expiresIn.
   */
  expiresIn?: number;
}

/**
 * Create a signed JWT the jwt-auth plugin accepts.
 *
 * Sets `iat` to the current time. Pass `expiresIn` (seconds) to also set
 * `exp`; without it the payload's own `exp` (if any) is kept.
 *
 * @param payload - Claims to sign
 * @param options - Key, algorithm, and lifetime
 * @returns The signed token, ready for an `Authorization: Bearer` header
 *
 * @example
 * ```typescript
 * // Login route: sign a token
 * import { signJwt } from "./ecosystem/plugins/jwt-auth/jwt-auth";
 *
 * export async function POST(ctx: BurgerContext) {
 *   const token = await signJwt(
 *     { sub: "user-123", roles: ["admin"] },
 *     { secret: process.env.JWT_SECRET!, expiresIn: 3600 }
 *   );
 *   return Response.json({ token });
 * }
 * ```
 */
export async function signJwt(
  payload: JwtPayload,
  options: SignJwtOptions = {}
): Promise<string> {
  const { secret, privateKey, algorithm = "HS256", expiresIn } = options;
  const signingKey = privateKey ?? secret;

  if (!signingKey) {
    throw new Error(
      "signJwt requires either `secret` or `privateKey` option"
    );
  }

  // Same rule as the plugin: RS/ES sign with an asymmetric private key.
  if (isAsymmetric(algorithm) && !privateKey) {
    throw new Error(
      `signJwt: algorithm ${algorithm} requires a \`privateKey\` CryptoKey option. ` +
        "`secret` only works with the HMAC algorithms (HS256, HS384, HS512)."
    );
  }

  // Same minimum as the plugin, so signed tokens are never weaker than the
  // verifier accepts.
  if (
    algorithm.startsWith("HS") &&
    typeof secret === "string" &&
    secret.length < 32
  ) {
    throw new Error(
      `signJwt: HMAC secret must be at least 32 bytes long (got ${secret.length} bytes). ` +
        "Generate one with `openssl rand -base64 32` and load it from an environment variable."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: JwtPayload = { ...payload, iat: now };
  if (expiresIn !== undefined) claims.exp = now + expiresIn;

  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: algorithm, typ: "JWT" }))
  );
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(claims))
  );
  const data = new TextEncoder().encode(`${header}.${body}`);

  const cryptoKey =
    typeof signingKey === "string"
      ? await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(signingKey),
          getImportAlgorithm(algorithm),
          false,
          ["sign"]
        )
      : signingKey;

  const signature = await crypto.subtle.sign(
    getSignVerifyAlgorithm(algorithm),
    cryptoKey,
    data
  );

  return `${header}.${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}
