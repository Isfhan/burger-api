/**
 * Session Plugin for BurgerAPI
 *
 * Loads session data from a cookie-backed store and attaches it to the
 * context.
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

declare module "burger-api" {
  interface BurgerContext {
    /**
     * Session data (set by the session plugin). `undefined` until a session
     * exists; assign an object with at least one key to create one (e.g. on
     * login), assign `undefined` to destroy it (logout).
     */
    session?: Record<string, unknown>;
  }
}

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
 * Verify and extract the session ID from a signed value. The HMAC is compared
 * in constant time so the signature cannot leak through timing.
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
 * Deep-compare the snapshot against current session data. JSON key order is
 * stable because both come from the same object.
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

          let sessionId: string | undefined = ctx.cookies[cookie];

          if (secret && sessionId) {
            const verifiedId = await verifySessionId(sessionId, secret);
            if (!verifiedId) {
              // Invalid signature — treat as no session
              sessionId = undefined;
            } else {
              sessionId = verifiedId;
            }
          }

          if (!sessionId) {
            return undefined;
          }

          const sessionData = await store.get(sessionId);
          if (!sessionData) {
            return undefined;
          }

          // Stash the ID and a copy of the data for mapResponse, so handler
          // mutations are detectable by comparison.
          sessionCtx._sessionId = sessionId;
          sessionCtx._sessionSnapshot = structuredClone(sessionData);

          return sessionData;
        },
      },

      beforeRoute: (ctx: BurgerContext): void => {
        const config = ctx.config as { auth?: boolean | { required?: boolean } } | undefined;

        // Skip auth check if explicitly disabled
        if (config?.auth === false || (typeof config?.auth === "object" && config.auth.required === false)) {
          return;
        }

        // Routes require an existing session unless `auth: false`. This
        // only proves the client holds a valid session cookie — NOT that a
        // user is logged in. Check a field your login handler sets (e.g.
        // `ctx.session?.userId`) to require an authenticated user.
        if (!ctx.session) {
          throw new UnauthorizedError("Session required");
        }
      },

      mapResponse: (ctx: BurgerContext): ((response: Response) => Promise<Response>) => {
        // Response hooks return a transform the framework applies.
        return async (response: Response): Promise<Response> => {
          const sessionCtx = ctx as unknown as {
            _sessionId?: string;
            _sessionSnapshot?: Record<string, unknown>;
          };
          const sessionId = sessionCtx._sessionId;
          const current = ctx.session;

          // Sessions are created lazily: a store entry and cookie only appear
          // when the handler put data in `ctx.session` (e.g. on login).
          if (!sessionId) {
            if (!isNonEmptySession(current)) {
              return response;
            }
            return issueSession(response, current);
          }

          // Handler cleared the session (logout): destroy it and expire the cookie.
          if (!current) {
            await store.destroy(sessionId);
            return withCookie(
              response,
              buildCookieHeader(cookie, "", { ...cookieOpts, maxAge: 0 })
            );
          }

          if (!dataChanged(sessionCtx._sessionSnapshot, current)) {
            return response;
          }

          // Data changed: rotate the ID (keeping the data) by default, or
          // write it back under the same ID.
          if (regenerateOnAuth) {
            await store.destroy(sessionId);
            return issueSession(response, current);
          }
          await store.set(sessionId, current, maxAge);
          return response;
        };
      },
    },
  };

  /** Store `data` under a fresh ID and attach its cookie to the response. */
  async function issueSession(
    response: Response,
    data: Record<string, unknown>
  ): Promise<Response> {
    const newSessionId = generateSessionId();
    const signedId = secret
      ? await signSessionId(newSessionId, secret)
      : newSessionId;
    await store.set(newSessionId, data, maxAge);
    return withCookie(response, buildCookieHeader(cookie, signedId, cookieOpts));
  }
}

/** True when the handler put at least one value in the session. */
function isNonEmptySession(
  value: Record<string, unknown> | undefined
): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.keys(value).length > 0
  );
}

/** Copy the response with an extra `Set-Cookie` header. */
function withCookie(response: Response, setCookie: string): Response {
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  newResponse.headers.append("Set-Cookie", setCookie);
  return newResponse;
}

// Re-export store for users
export { MemorySessionStore as memoryStore };
