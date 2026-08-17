/**
 * Session Plugin for BurgerAPI
 *
 * Official session management plugin that integrates with BurgerAPI's hook system.
 * Parses session ID from cookie, loads session data from configurable store, and
 * attaches session object to context.
 *
 * @example
 * ```typescript
 * import { Burger } from "burger-api";
 * import { session } from "./ecosystem/plugins/session/session";
 *
 * const burger = new Burger();
 *
 * burger.usePlugin(session({
 *   secret: process.env.SESSION_SECRET,
 * }));
 * ```
 */

import type { Plugin, BurgerContext } from "burger-api";
import { UnauthorizedError, timingSafeEqual } from "burger-api";

/**
 * Session store interface
 */
export interface SessionStore {
  /**
   * Get session by ID
   * @param id - Session ID
   * @returns Session data or null if not found
   */
  get(id: string): Promise<Record<string, unknown> | null>;

  /**
   * Set session data
   * @param id - Session ID
   * @param data - Session data
   * @param maxAge - Max age in seconds
   */
  set(id: string, data: Record<string, unknown>, maxAge?: number): Promise<void>;

  /**
   * Destroy session
   * @param id - Session ID
   */
  destroy(id: string): Promise<void>;
}

/**
 * In-memory session store (for development/testing)
 */
export class MemorySessionStore implements SessionStore {
  private store = new Map<string, { data: Record<string, unknown>; expires?: number }>();

  async get(id: string): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(id);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expires && Date.now() > entry.expires) {
      this.store.delete(id);
      return null;
    }

    return entry.data;
  }

  async set(id: string, data: Record<string, unknown>, maxAge?: number): Promise<void> {
    this.store.set(id, {
      data,
      expires: maxAge ? Date.now() + maxAge * 1000 : undefined,
    });
  }

  async destroy(id: string): Promise<void> {
    this.store.delete(id);
  }
}

/**
 * Session plugin configuration options
 */
export interface SessionOptions {
  /**
   * Cookie name for session ID (default: "session_id")
   */
  cookie?: string;

  /**
   * Max session age in seconds (default: 86400 = 24 hours)
   */
  maxAge?: number;

  /**
   * Session store (default: MemorySessionStore)
   */
  store?: SessionStore;

  /**
   * Whether to use secure cookies (default: true in production)
   */
  secure?: boolean;

  /**
   * Cookie path (default: "/")
   */
  path?: string;

  /**
   * Cookie domain
   */
  domain?: string;

  /**
   * Whether to use SameSite cookie attribute (default: "lax")
   */
  sameSite?: "strict" | "lax" | "none";

  /**
   * Secret for signing session IDs (required for secure sessions)
   */
  secret?: string;

  /**
   * Whether to regenerate session ID on auth (default: true)
   */
  regenerateOnAuth?: boolean;
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign a session ID
 */
async function signSessionId(sessionId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sessionId)
  );

  const signatureArray = new Uint8Array(signature);
  const signatureHex = Array.from(signatureArray, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `${sessionId}.${signatureHex}`;
}

/**
 * Verify and extract session ID from signed value
 *
 * The HMAC signature is compared in constant time so an attacker cannot
 * recover it byte-by-byte via response-timing.
 */
async function verifySessionId(
    signed: string,
    secret: string
): Promise<string | null> {
    const lastDot = signed.lastIndexOf(".");
    if (lastDot === -1) {
        return null;
    }

    const sessionId = signed.slice(0, lastDot);
    const signature = signed.slice(lastDot + 1);

    const expected = await signSessionId(sessionId, secret);
    const expectedSignature = expected.slice(lastDot + 1);
    if (!timingSafeEqual(expectedSignature, signature)) {
        return null;
    }

    return sessionId;
}

/**
 * Build a session cookie header.
 */
function buildCookieHeader(
    cookie: string,
    signedId: string,
    opts: {
        path: string;
        maxAge: number;
        sameSite: "strict" | "lax" | "none";
        secure: boolean;
        domain?: string;
    }
): string {
    return [
        `${cookie}=${signedId}`,
        `Path=${opts.path}`,
        `Max-Age=${opts.maxAge}`,
        `SameSite=${opts.sameSite}`,
        opts.secure ? "Secure" : "",
        "HttpOnly",
        opts.domain ? `Domain=${opts.domain}` : "",
    ]
        .filter(Boolean)
        .join("; ");
}

/**
 * Deep-compare two session data records (snapshot vs. current). Both derive
 * from the same store object, so JSON key order is stable unless a handler
 * deleted and re-added keys — an acceptable edge for rotation detection.
 */
function dataChanged(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

/**
 * Create session plugin
 *
 * @param options - Plugin configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * burger.usePlugin(session());
 *
 * // With Redis store
 * import { RedisStore } from "./stores/redis";
 * burger.usePlugin(session({
 *   store: new RedisStore({ url: process.env.REDIS_URL }),
 * }));
 * ```
 */
export function session(options: SessionOptions = {}): Plugin {
  const {
    cookie = "session_id",
    maxAge = 86400,
    store = new MemorySessionStore(),
    secure = process.env.NODE_ENV === "production",
    path = "/",
    domain,
    sameSite = "lax",
    secret,
    regenerateOnAuth = true,
  } = options;

  if (!secret && process.env.NODE_ENV === "production") {
    console.warn(
      "[burger-api/plugin-session] No `secret` configured — session IDs are unsigned and vulnerable to fixation. Set a strong secret in production."
    );
  }
  if (!secure && process.env.NODE_ENV === "production") {
    console.warn(
      "[burger-api/plugin-session] `secure: false` in production — the session cookie will be sent over plain HTTP."
    );
  }

  const cookieOpts = { path, maxAge, sameSite, secure, domain };

  return {
    name: "session",

    hooks: {
      transform: {
        session: async (ctx: BurgerContext): Promise<Record<string, unknown> | undefined> => {
          const sessionCtx = ctx as unknown as {
            _sessionId?: string;
            _sessionSnapshot?: Record<string, unknown>;
          };

          // Get session ID from cookie
          let sessionId: string | undefined = ctx.cookies[cookie];

          // Verify signature if secret provided
          if (secret && sessionId) {
            const verifiedId = await verifySessionId(sessionId, secret);
            if (!verifiedId) {
              // Invalid signature - ignore session
              sessionId = undefined;
            } else {
              sessionId = verifiedId;
            }
          }

          if (!sessionId) {
            return undefined;
          }

          // Load session from store
          const sessionData = await store.get(sessionId);
          if (!sessionData) {
            return undefined;
          }

          // Attach session ID and a deep copy of the data snapshot to context
          // for later use. The copy (not the reference) is what mapResponse
          // compares against, so handler mutations are detectable.
          sessionCtx._sessionId = sessionId;
          sessionCtx._sessionSnapshot = structuredClone(sessionData);

          return sessionData;
        },
      },

      beforeRoute: (ctx: BurgerContext): void => {
        // Get config for this route
        const config = ctx.config as { auth?: boolean | { required?: boolean } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Get session from transform
        const session = (ctx as { session?: Record<string, unknown> }).session;
        if (!session) {
          // No session - auth required
          throw new UnauthorizedError("Session required");
        }
      },

      mapResponse: (ctx: BurgerContext): ((response: Response) => Promise<Response>) => {
        // 1.0 contract: response hooks return a transform function;
        // the framework applies it to the response. (Legacy two-arg form is
        // not supported by the pipeline.)
        return async (response: Response): Promise<Response> => {
          const sessionCtx = ctx as unknown as {
            _sessionId?: string;
            _sessionSnapshot?: Record<string, unknown>;
            session?: Record<string, unknown>;
          };
          const sessionId = sessionCtx._sessionId;

          // Create a new session if none exists: persist an empty session in
          // the store so the ID is valid on the next request.
          if (!sessionId) {
            const newSessionId = generateSessionId();
            const signedId = secret
              ? await signSessionId(newSessionId, secret)
              : newSessionId;
            await store.set(newSessionId, {}, maxAge);

            // Set cookie
            const newResponse = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
            newResponse.headers.append(
              "Set-Cookie",
              buildCookieHeader(cookie, signedId, cookieOpts)
            );

            return newResponse;
          }

          // Regenerate the session ID when the session data changed during
          // this request (login/logout/data write), migrating the data to the
          // new ID so the session survives. Unchanged sessions keep their ID.
          if (regenerateOnAuth) {
            const current = sessionCtx.session;
            if (dataChanged(sessionCtx._sessionSnapshot, current)) {
              const newSessionId = generateSessionId();
              const signedId = secret
                ? await signSessionId(newSessionId, secret)
                : newSessionId;

              await store.set(newSessionId, current ?? {}, maxAge);
              await store.destroy(sessionId);

              // Set cookie with new ID
              const newResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              });
              newResponse.headers.append(
                "Set-Cookie",
                buildCookieHeader(cookie, signedId, cookieOpts)
              );

              return newResponse;
            }
          }

          return response;
        };
      },
    },
  };
}

// Re-export store for users
export { MemorySessionStore as memoryStore };
