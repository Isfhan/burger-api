import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

/**
 * Configuration options for the JWT authentication middleware.
 */
export interface JWTAuthOptions {
    /**
     * Secret key for verifying JWT signatures.
     * Keep this secret and never expose it in client code!
     */
    secret: string;

    /**
     * Algorithm to use for JWT verification.
     * @default 'HS256'
     */
    algorithm?: 'HS256' | 'HS384' | 'HS512';

    /**
     * Name of the cookie containing the JWT token.
     * If specified, the middleware will check cookies in addition to headers.
     * @default undefined (only check Authorization header)
     */
    cookie?: string;

    /**
     * Query parameter name containing the JWT token.
     * If specified, the middleware will check query params as a fallback.
     * @default undefined (only check Authorization header)
     */
    queryParam?: string;

    /**
     * Custom function to extract the token from the request.
     * If provided, this overrides the default token extraction logic.
     *
     * @param req - The request object
     * @returns The JWT token or null if not found
     */
    getToken?: (req: BurgerRequest) => string | null;

    /**
     * Custom error handler for authentication failures.
     * If not provided, returns a default 401 response.
     *
     * @param reason - The reason for authentication failure
     * @returns Response to send when authentication fails
     */
    onError?: (reason: string) => Response;

    /**
     * Property name to attach decoded user data to the request object.
     * @default 'user'
     */
    requestProperty?: string;
}

/**
 * JWT payload structure.
 */
export interface JWTPayload {
    [key: string]: any;
    exp?: number; // Expiration time (seconds since epoch)
    iat?: number; // Issued at (seconds since epoch)
    nbf?: number; // Not before (seconds since epoch)
}

/**
 * Creates a JWT authentication middleware for protecting routes.
 *
 * This middleware verifies JWT tokens from the Authorization header (Bearer token),
 * cookies, or query parameters. It decodes the token, verifies the signature,
 * and attaches the user data to the request object.
 *
 * @param options - Configuration options for JWT authentication
 * @returns A middleware function that authenticates requests
 *
 * @example
 * ```typescript
 * // Basic usage
 * const jwtAuth = jwt({ secret: 'your-secret-key' });
 *
 * // With cookie support
 * const jwtAuth = jwt({
 *   secret: 'your-secret-key',
 *   cookie: 'token'
 * });
 *
 * // With custom error handling
 * const jwtAuth = jwt({
 *   secret: 'your-secret-key',
 *   onError: (reason) => Response.json(
 *     { error: 'Authentication failed', reason },
 *     { status: 401 }
 *   )
 * });
 * ```
 */
export function jwt(options: JWTAuthOptions): Middleware {
    const {
        secret,
        algorithm = 'HS256',
        cookie,
        queryParam,
        getToken,
        onError = defaultErrorHandler,
        requestProperty = 'user',
    } = options;

    if (!secret) {
        throw new Error('JWT secret is required');
    }

    return async (req: BurgerRequest): Promise<BurgerNext> => {
        // Extract token from request
        let token: string | null = null;

        if (getToken) {
            // Use custom token extractor
            token = getToken(req);
        } else {
            // Default token extraction logic
            // 1. Check Authorization header (Bearer token)
            const authHeader = req.headers.get('Authorization');
            if (authHeader?.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }

            // 2. Check cookie if specified
            if (!token && cookie) {
                const cookies = parseCookies(req.headers.get('Cookie') || '');
                token = cookies[cookie] || null;
            }

            // 3. Check query parameter if specified
            if (!token && queryParam) {
                const url = new URL(req.url);
                token = url.searchParams.get(queryParam);
            }
        }

        // If no token found, return 401
        if (!token) {
            return onError('No token provided');
        }

        // Verify and decode the JWT
        try {
            const payload = await verifyJWT(token, secret, algorithm);

            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return onError('Token expired');
            }

            // Check not before
            if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
                return onError('Token not yet valid');
            }

            // Attach decoded user data to request
            (req as any)[requestProperty] = payload;

            // Continue to next middleware/handler
            return undefined;
        } catch (error) {
            return onError(error instanceof Error ? error.message : 'Invalid token');
        }
    };
}

/**
 * Decode a base64url-encoded string to a UTF-8 string.
 * Uses Bun's native base64url decoding support.
 */
function decodeBase64URL(base64url: string): string {
    // Decode the Base64URL string into a Uint8Array using Bun's native support
    const uint8Array = Uint8Array.fromBase64(base64url, { alphabet: 'base64url' });
    
    // Convert the Uint8Array to a UTF-8 string
    return new TextDecoder('utf-8').decode(uint8Array);
}

/**
 * Verify and decode a JWT token.
 * This is a simplified implementation. For production, consider using a library like `jose`.
 */
async function verifyJWT(
    token: string,
    secret: string,
    algorithm: string
): Promise<JWTPayload> {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid token format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header (base64url to JSON)
    const header = JSON.parse(decodeBase64URL(headerB64));
    if (header.alg !== algorithm) {
        throw new Error(`Algorithm mismatch: expected ${algorithm}, got ${header.alg}`);
    }

    // Decode payload (base64url to JSON)
    const payload: JWTPayload = JSON.parse(decodeBase64URL(payloadB64));

    // Verify signature
    const data = `${headerB64}.${payloadB64}`;
    const expectedSignature = await signData(data, secret, algorithm);

    if (signatureB64 !== expectedSignature) {
        throw new Error('Invalid signature');
    }

    return payload;
}

/**
 * Sign data using HMAC.
 */
async function signData(data: string, secret: string, algorithm: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const dataBuffer = encoder.encode(data);

    // Determine hash algorithm
    let hashAlgorithm: string;
    switch (algorithm) {
        case 'HS256':
            hashAlgorithm = 'SHA-256';
            break;
        case 'HS384':
            hashAlgorithm = 'SHA-384';
            break;
        case 'HS512':
            hashAlgorithm = 'SHA-512';
            break;
        default:
            throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    // Import key for HMAC
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: hashAlgorithm },
        false,
        ['sign']
    );

    // Sign the data
    const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);

    // Convert to base64url
    return arrayBufferToBase64Url(signature);
}

/**
 * Convert ArrayBuffer to base64url encoding.
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Parse cookies from Cookie header.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach((cookie) => {
        const [name, ...rest] = cookie.split('=');
        if (name && rest.length) {
            cookies[name.trim()] = rest.join('=').trim();
        }
    });

    return cookies;
}

/**
 * Default error handler for authentication failures.
 */
function defaultErrorHandler(reason: string): Response {
    return Response.json(
        {
            error: 'Unauthorized',
            message: reason,
        },
        {
            status: 401,
            statusText: 'Unauthorized',
            headers: {
                'WWW-Authenticate': 'Bearer',
            },
        }
    );
}

/**
 * Helper function to create a JWT token (for testing purposes).
 * In production, use a proper JWT library.
 */
export async function createJWT(
    payload: JWTPayload,
    secret: string,
    algorithm: 'HS256' | 'HS384' | 'HS512' = 'HS256'
): Promise<string> {
    // Create header
    const header = {
        alg: algorithm,
        typ: 'JWT',
    };

    // Encode header and payload
    const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    const payloadB64 = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    // Sign
    const data = `${headerB64}.${payloadB64}`;
    const signature = await signData(data, secret, algorithm);

    return `${headerB64}.${payloadB64}.${signature}`;
}

