/**
 * OpenID Connect Plugin for BurgerAPI
 *
 * Verifies an OIDC token against the provider's JWKS and attaches its claims
 * to the context.
 *
 * @example
 * ```typescript
 * import { Burger } from "burger-api";
 * import { oidc } from "./ecosystem/plugins/oidc/oidc";
 *
 * const burger = new Burger();
 *
 * burger.usePlugin(oidc({
 *   issuer: "https://accounts.google.com",
 *   audience: "my-client-id",
 * }));
 * ```
 */

import type { Plugin, BurgerContext } from "burger-api";
import { HTTPError, UnauthorizedError, ForbiddenError } from "burger-api";

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
    /** User roles */
    roles?: string[];
  }
}

/**
 * OIDC plugin configuration options
 */
export interface OidcOptions {
  /**
   * OIDC issuer URL (e.g., "https://accounts.google.com")
   */
  issuer: string;

  /**
   * Required audience claim
   */
  audience?: string;

  /**
   * Header name to extract token from (default: "Authorization")
   */
  header?: string;

  /**
   * Token prefix (default: "Bearer")
   */
  prefix?: string;

  /**
   * Clock tolerance in seconds for expiration checks (default: 0)
   */
  clockTolerance?: number;

  /**
   * JWKS cache TTL in seconds (default: 3600 = 1 hour)
   */
  jwksCacheTtl?: number;

  /**
   * Allowed token `alg` values (default: ["RS256", "ES256"])
   */
  algorithms?: string[];

  /**
   * Require an `exp` claim on every token (default: true).
   */
  requireExpiration?: boolean;
}

/**
 * OIDC discovery document
 */
interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  [key: string]: unknown;
}

/**
 * JWKS key
 */
interface JwksKey {
  kty: string;
  use?: string;
  kid: string;
  alg?: string;
  n?: string;
  e?: string;
  x5c?: string[];
  [key: string]: unknown;
}

/**
 * JWKS response
 */
interface JwksResponse {
  keys: JwksKey[];
}

const DEFAULT_ALGORITHMS = ["RS256", "ES256"];

/**
 * Web Crypto algorithm types derived from the platform, so this compiles
 * without the DOM lib.
 */
type ImportKeyAlgorithm = NonNullable<
  Parameters<typeof crypto.subtle.importKey>[2]
>;
type VerifyAlgorithm = NonNullable<Parameters<typeof crypto.subtle.verify>[0]>;

/**
 * Fetch OIDC discovery document
 */
async function fetchDiscovery(issuer: string): Promise<OidcDiscovery> {
  const url = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery: ${response.statusText}`);
  }

  return response.json() as Promise<OidcDiscovery>;
}

/**
 * Fetch JWKS from provider
 */
async function fetchJwks(jwksUri: string): Promise<JwksKey[]> {
  const response = await fetch(jwksUri);

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
  }

  const data = (await response.json()) as JwksResponse;
  return data.keys;
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const normalized = padding ? padded + "=".repeat(4 - padding) : padded;
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

/**
 * Verify JWT signature using JWKS
 *
 * The token's `alg` must be allowlisted, and the selected key must match the
 * algorithm family (`kty`) and be usable for signatures (`use`).
 *
 * Returns `'unknown-kid'` when no key with the token's `kid` exists, so the
 * caller can refetch keys once after a rotation. Import/verification failures
 * are `'invalid'` — auth failures, not server errors.
 */
async function verifyToken(
  token: string,
  keys: JwksKey[],
  algorithms: string[]
): Promise<"valid" | "invalid" | "unknown-kid"> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return "invalid";
  }

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) {
    return "invalid";
  }

  let headerDecoded: { alg?: unknown; kid?: unknown };
  try {
    headerDecoded = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(header))
    );
  } catch {
    return "invalid";
  }

  const alg = headerDecoded.alg;
  if (typeof alg !== "string" || !algorithms.includes(alg)) {
    return "invalid";
  }

  const kid = headerDecoded.kid;
  if (typeof kid !== "string" || !kid) {
    return "invalid";
  }

  // Key must be usable for signatures and match the token's alg if declared.
  const key = keys.find(
    (k) =>
      k.kid === kid &&
      (k.use === undefined || k.use === "sig") &&
      (k.alg === undefined || k.alg === alg)
  );
  if (!key) {
    // A rotated-out key is worth one refetch; a key that is present but
    // unusable for this token is not.
    return keys.some((k) => k.kid === kid) ? "invalid" : "unknown-kid";
  }

  let importAlgorithm: ImportKeyAlgorithm;
  let verifyAlgorithm: VerifyAlgorithm;
  if (alg === "RS256") {
    if (key.kty !== "RSA") {
      return "invalid";
    }
    importAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    verifyAlgorithm = "RSASSA-PKCS1-v1_5";
  } else if (alg === "ES256") {
    if (key.kty !== "EC") {
      return "invalid";
    }
    importAlgorithm = { name: "ECDSA", namedCurve: "P-256" };
    verifyAlgorithm = { name: "ECDSA", hash: "SHA-256" };
  } else {
    // Allowlisted but unsupported here
    return "invalid";
  }

  const data = new TextEncoder().encode(`${header}.${payload}`);

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64UrlDecode(signature);
  } catch {
    return "invalid";
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key,
      importAlgorithm,
      false,
      ["verify"]
    );
  } catch {
    return "invalid";
  }

  const valid = await crypto.subtle.verify(
    verifyAlgorithm,
    cryptoKey,
    signatureBytes,
    data
  );
  return valid ? "valid" : "invalid";
}

/**
 * Create OpenID Connect plugin
 *
 * @param options - Plugin configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * // Google OIDC
 * burger.usePlugin(oidc({
 *   issuer: "https://accounts.google.com",
 *   audience: "my-client-id",
 * }));
 *
 * // Auth0
 * burger.usePlugin(oidc({
 *   issuer: "https://my-tenant.auth0.com/",
 *   audience: "https://api.myapp.com",
 * }));
 * ```
 */
export function oidc(options: OidcOptions): Plugin {
  const {
    issuer,
    audience,
    header = "Authorization",
    prefix = "Bearer",
    clockTolerance = 0,
    jwksCacheTtl = 3600,
    algorithms = DEFAULT_ALGORITHMS,
    requireExpiration = true,
  } = options;

  // Per-instance state: different issuers must verify against their own keys.
  let discoveryPromise: Promise<OidcDiscovery> | null = null;
  let discovery: OidcDiscovery | null = null;
  let jwksCache: {
    keys: JwksKey[];
    expires: number;
    inflight: Promise<JwksKey[]> | null;
  } | null = null;

  // At most one forced refetch per 30s: an unknown `kid` must not let forged
  // tokens hammer the IdP.
  const FORCED_REFRESH_MS = 30_000;
  let lastForcedRefresh = 0;

  async function refreshJwks(jwksUri: string): Promise<JwksKey[]> {
    const keys = await fetchJwks(jwksUri);
    jwksCache = {
      keys,
      expires: Date.now() + jwksCacheTtl * 1000,
      inflight: null,
    };
    return keys;
  }

  async function forceRefreshJwks(jwksUri: string): Promise<JwksKey[] | null> {
    const now = Date.now();
    if (now - lastForcedRefresh < FORCED_REFRESH_MS) {
      return null;
    }
    // Count failed attempts too, so a failing IdP is not retried per request.
    lastForcedRefresh = now;
    try {
      return await refreshJwks(jwksUri);
    } catch {
      return null;
    }
  }

  async function getJwks(jwksUri: string): Promise<JwksKey[]> {
    const cache = jwksCache;
    if (cache && Date.now() < cache.expires) {
      return cache.keys;
    }
    if (cache) {
      // TTL expired: serve stale keys while one refresh runs; a failed
      // refresh keeps them usable and the next request retries.
      cache.inflight ??= refreshJwks(jwksUri).catch(() => {
        cache.inflight = null;
        return cache.keys;
      });
      return cache.keys;
    }
    return refreshJwks(jwksUri);
  }

  return {
    name: "oidc",

    hooks: {
      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        const config = ctx.config as
          | { auth?: boolean | { required?: boolean; roles?: string[] } }
          | undefined;

        // Skip auth check if explicitly disabled. The token is not parsed
        // here — unverified claims never reach auth-disabled routes.
        if (
          config?.auth === false ||
          (typeof config?.auth === "object" && config.auth.required === false)
        ) {
          return;
        }

        // The prefix must match exactly.
        const authHeader = ctx.headers.get(header);
        if (!authHeader?.startsWith(`${prefix} `)) {
          throw new UnauthorizedError("Missing or invalid token");
        }
        const token = authHeader.slice(prefix.length + 1);

        // Resolve discovery and keys lazily, only when a token must be verified.
        let keys: JwksKey[];
        try {
          if (!discovery) {
            try {
              discovery = await (discoveryPromise ??= fetchDiscovery(issuer));
            } catch (error) {
              discoveryPromise = null;
              throw error;
            }
          }
          keys = await getJwks(discovery.jwks_uri);
        } catch (error) {
          // Provider failure, not a bad token: log server-side and tell the
          // client to retry.
          console.error(
            `[burger-api/plugin-oidc] Failed to load discovery/JWKS for issuer "${issuer}":`,
            error
          );
          throw new HTTPError(503, "Authentication provider unavailable");
        }

        let verification = await verifyToken(token, keys, algorithms);
        if (verification === "unknown-kid") {
          // The provider may have rotated keys before the cache TTL expired.
          const refreshed = await forceRefreshJwks(discovery.jwks_uri);
          if (refreshed) {
            verification = await verifyToken(token, refreshed, algorithms);
          }
        }
        if (verification !== "valid") {
          throw new UnauthorizedError("Invalid token signature");
        }

        // Only after the signature verifies may the payload be trusted.
        let user: Record<string, unknown>;
        try {
          const parts = token.split(".");
          user = JSON.parse(
            new TextDecoder().decode(base64UrlDecode(parts[1]!))
          ) as Record<string, unknown>;
        } catch {
          throw new UnauthorizedError("Malformed token");
        }

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

        // The issuer must match exactly.
        if (user.iss !== issuer) {
          throw new UnauthorizedError("Invalid issuer");
        }

        // A configured audience must be present and listed.
        if (audience) {
          if (!user.aud) {
            throw new UnauthorizedError("Invalid audience");
          }
          const audArray = Array.isArray(user.aud)
            ? user.aud
            : [user.aud];
          if (!audArray.includes(audience)) {
            throw new UnauthorizedError("Invalid audience");
          }
        }

        const requiredRoles =
          config?.auth && typeof config.auth === "object" ? config.auth.roles : undefined;
        if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
          // A non-array claim counts as no roles: `includes` on a string
          // would match substrings.
          const claim = user.roles;
          const userRoles: unknown[] = Array.isArray(claim) ? claim : [];
          const hasRole = requiredRoles.some((role) => userRoles.includes(role));

          if (!hasRole) {
            throw new ForbiddenError("Insufficient permissions");
          }
        }

        // Attach verified claims only.
        (ctx as { user?: Record<string, unknown> }).user = user;
      },
    },
  };
}