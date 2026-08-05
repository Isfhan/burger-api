/**
 * OpenID Connect Plugin for BurgerAPI
 *
 * Official OpenID Connect authentication plugin that integrates with BurgerAPI's hook system.
 * Parses OIDC token, verifies signature against provider's JWKS, and attaches user info to context.
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
import { UnauthorizedError } from "burger-api";

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

/**
 * Cached JWKS
 */
let cachedJwks: { keys: JwksKey[]; expires: number } | null = null;

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
async function fetchJwks(
  jwksUri: string,
  cacheTtl: number
): Promise<JwksKey[]> {
  // Check cache
  if (cachedJwks && Date.now() < cachedJwks.expires) {
    return cachedJwks.keys;
  }

  const response = await fetch(jwksUri);

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
  }

  const data = (await response.json()) as JwksResponse;

  // Cache the keys
  cachedJwks = {
    keys: data.keys,
    expires: Date.now() + cacheTtl * 1000,
  };

  return data.keys;
}

/**
 * Import RSA public key from JWK
 */
async function importRsaKey(jwk: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const normalized = padding ? padded + "=".repeat(4 - padding) : padded;
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

/**
 * Verify JWT signature using JWKS
 */
async function verifyToken(
  token: string,
  keys: JwksKey[],
  algorithm: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [header, payload, signature] = parts;
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const signatureBytes = base64UrlDecode(signature);

  // Decode header to get kid
  const headerDecoded = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(header))
  );

  const kid = headerDecoded.kid;
  if (!kid) {
    return false;
  }

  // Find key by kid
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    return false;
  }

  // Import key
  const cryptoKey = await importRsaKey(key);

  // Verify signature
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureBytes,
    data
  );
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
  } = options;

  let discovery: OidcDiscovery | null = null;
  let jwks: JwksKey[] | null = null;

  return {
    name: "oidc",

    hooks: {
      onRequest: async (): Promise<void> => {
        // Fetch discovery document and JWKS on first request
        if (!discovery) {
          discovery = await fetchDiscovery(issuer);
          jwks = await fetchJwks(discovery.jwks_uri, jwksCacheTtl);
        }
      },

      transform: {
        user: (ctx: BurgerContext): Record<string, unknown> | undefined => {
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

          // Decode payload without verification (verification happens in beforeRoute)
          const parts = token.split(".");
          if (parts.length !== 3) {
            return undefined;
          }

          try {
            const payload = JSON.parse(
              new TextDecoder().decode(base64UrlDecode(parts[1]))
            );

            return payload as Record<string, unknown>;
          } catch {
            return undefined;
          }
        },
      },

      beforeRoute: async (ctx: BurgerContext): Promise<void> => {
        // Get config for this route
        const config = ctx.config as { auth?: boolean | { required?: boolean } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Get user from transform
        const user = (ctx as { user?: Record<string, unknown> }).user;
        if (!user) {
          throw new UnauthorizedError("Missing or invalid token");
        }

        // Get token
        const authHeader = ctx.headers.get(header);
        const token = authHeader?.slice(prefix.length + 1);

        if (!token || !jwks) {
          throw new UnauthorizedError("Missing token");
        }

        // Verify signature
        const isValid = await verifyToken(token, jwks, "RS256");
        if (!isValid) {
          throw new UnauthorizedError("Invalid token signature");
        }

        // Check expiration
        if (user.exp !== undefined) {
          const now = Math.floor(Date.now() / 1000);
          if ((user.exp as number) < now - clockTolerance) {
            throw new UnauthorizedError("Token expired");
          }
        }

        // Check not-before
        if (user.nbf !== undefined) {
          const now = Math.floor(Date.now() / 1000);
          if ((user.nbf as number) > now + clockTolerance) {
            throw new UnauthorizedError("Token not yet valid");
          }
        }

        // Check issuer
        if (user.iss !== issuer) {
          throw new UnauthorizedError("Invalid issuer");
        }

        // Check audience
        if (audience && user.aud) {
          const audArray = Array.isArray(user.aud)
            ? user.aud
            : [user.aud];
          if (!audArray.includes(audience)) {
            throw new UnauthorizedError("Invalid audience");
          }
        }
      },
    },
  };
}
