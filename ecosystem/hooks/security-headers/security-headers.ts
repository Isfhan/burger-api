import type { BurgerContext, BurgerNext } from 'burger-api';

/**
 * Configuration options for the security headers hook.
 */
export interface SecurityHeadersOptions {
    /**
     * Content Security Policy (CSP) directives.
     * Controls which resources the browser is allowed to load.
     *
     * @default undefined (not set)
     * @example
     * ```typescript
     * {
     *   contentSecurityPolicy: {
     *     defaultSrc: ["'self'"],
     *     scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.example.com"],
     *     styleSrc: ["'self'", "'unsafe-inline'"],
     *     imgSrc: ["'self'", "data:", "https:"],
     *     connectSrc: ["'self'", "https://api.example.com"]
     *   }
     * }
     * ```
     */
    contentSecurityPolicy?: Record<string, string[]> | false;

    /**
     * HTTP Strict Transport Security (HSTS) configuration.
     * Forces browsers to use HTTPS.
     *
     * @default { maxAge: 31536000, includeSubDomains: true }
     */
    strictTransportSecurity?:
        | {
              maxAge?: number;
              includeSubDomains?: boolean;
              preload?: boolean;
          }
        | false;

    /**
     * X-Frame-Options header value.
     * Prevents clickjacking attacks.
     *
     * @default 'DENY'
     * Options: 'DENY' | 'SAMEORIGIN' | false
     */
    frameOptions?: 'DENY' | 'SAMEORIGIN' | false;

    /**
     * X-Content-Type-Options header.
     * Prevents MIME type sniffing.
     *
     * @default 'nosniff'
     */
    contentTypeOptions?: 'nosniff' | false;

    /**
     * X-XSS-Protection header.
     * Enables XSS filtering in older browsers.
     *
     * @default '1; mode=block'
     */
    xssProtection?: '0' | '1' | '1; mode=block' | false;

    /**
     * Referrer-Policy header.
     * Controls how much referrer information is included.
     *
     * @default 'no-referrer'
     */
    referrerPolicy?:
        | 'no-referrer'
        | 'no-referrer-when-downgrade'
        | 'origin'
        | 'origin-when-cross-origin'
        | 'same-origin'
        | 'strict-origin'
        | 'strict-origin-when-cross-origin'
        | 'unsafe-url'
        | false;

    /**
     * Permissions-Policy header (formerly Feature-Policy).
     * Controls which browser features and APIs can be used.
     *
     * @default undefined (not set)
     * @example
     * ```typescript
     * {
     *   permissionsPolicy: {
     *     camera: [],              // Disable camera
     *     microphone: [],          // Disable microphone
     *     geolocation: ['self'],   // Allow geolocation from same origin
     *     payment: ['self', 'https://payment.example.com']
     *   }
     * }
     * ```
     */
    permissionsPolicy?: Record<string, string[]> | false;

    /**
     * X-DNS-Prefetch-Control header.
     * Controls DNS prefetching.
     *
     * @default 'off'
     */
    dnsPrefetchControl?: 'on' | 'off' | false;

    /**
     * X-Download-Options header.
     * Prevents IE from executing downloads in site context.
     *
     * @default 'noopen'
     */
    downloadOptions?: 'noopen' | false;

    /**
     * X-Permitted-Cross-Domain-Policies header.
     * Controls Adobe Flash and PDF cross-domain requests.
     *
     * @default 'none'
     */
    permittedCrossDomainPolicies?:
        | 'none'
        | 'master-only'
        | 'by-content-type'
        | 'by-ftp-filename'
        | 'all'
        | false;
}

/**
 * Creates a security headers hook to protect against common web vulnerabilities.
 *
 * This hook adds various security-related HTTP headers to responses to help
 * protect your application from attacks like XSS, clickjacking, and more.
 *
 * @param options - Configuration options for security headers
 * @returns A hook function that adds security headers to responses
 *
 * @example
 * ```typescript
 * // Use default security headers
 * const security = securityHeaders();
 *
 * // Custom configuration
 * const security = securityHeaders({
 *   contentSecurityPolicy: {
 *     defaultSrc: ["'self'"],
 *     scriptSrc: ["'self'", "https://cdn.example.com"]
 *   },
 *   frameOptions: 'SAMEORIGIN'
 * });
 *
 * // Disable specific headers
 * const security = securityHeaders({
 *   xssProtection: false,
 *   contentSecurityPolicy: false
 * });
 * ```
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        contentSecurityPolicy,
        strictTransportSecurity = { maxAge: 31536000, includeSubDomains: true },
        frameOptions = 'DENY',
        contentTypeOptions = 'nosniff',
        xssProtection = '1; mode=block',
        referrerPolicy = 'no-referrer',
        permissionsPolicy,
        dnsPrefetchControl = 'off',
        downloadOptions = 'noopen',
        permittedCrossDomainPolicies = 'none',
    } = options;

    return (_ctx: BurgerContext): BurgerNext => {
        // Transform response to add security headers
        return (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);

            // Content Security Policy
            if (contentSecurityPolicy !== false) {
                if (contentSecurityPolicy) {
                    const cspString = Object.entries(contentSecurityPolicy)
                        .map(([directive, values]) => {
                            const kebabDirective = camelToKebab(directive);
                            return `${kebabDirective} ${values.join(' ')}`;
                        })
                        .join('; ');
                    headers.set('Content-Security-Policy', cspString);
                }
            }

            // Strict Transport Security (HSTS)
            if (strictTransportSecurity !== false) {
                const parts = [`max-age=${strictTransportSecurity.maxAge || 31536000}`];
                if (strictTransportSecurity.includeSubDomains) {
                    parts.push('includeSubDomains');
                }
                if (strictTransportSecurity.preload) {
                    parts.push('preload');
                }
                headers.set('Strict-Transport-Security', parts.join('; '));
            }

            // X-Frame-Options
            if (frameOptions !== false) {
                headers.set('X-Frame-Options', frameOptions);
            }

            // X-Content-Type-Options
            if (contentTypeOptions !== false) {
                headers.set('X-Content-Type-Options', contentTypeOptions);
            }

            // X-XSS-Protection (for older browsers)
            if (xssProtection !== false) {
                headers.set('X-XSS-Protection', xssProtection);
            }

            // Referrer-Policy
            if (referrerPolicy !== false) {
                headers.set('Referrer-Policy', referrerPolicy);
            }

            // Permissions-Policy (formerly Feature-Policy)
            if (permissionsPolicy !== false && permissionsPolicy) {
                const policyString = Object.entries(permissionsPolicy)
                    .map(([feature, allowList]) => {
                        if (allowList.length === 0) {
                            return `${feature}=()`;
                        }
                        return `${feature}=(${allowList.join(' ')})`;
                    })
                    .join(', ');
                headers.set('Permissions-Policy', policyString);
            }

            // X-DNS-Prefetch-Control
            if (dnsPrefetchControl !== false) {
                headers.set('X-DNS-Prefetch-Control', dnsPrefetchControl);
            }

            // X-Download-Options
            if (downloadOptions !== false) {
                headers.set('X-Download-Options', downloadOptions);
            }

            // X-Permitted-Cross-Domain-Policies
            if (permittedCrossDomainPolicies !== false) {
                headers.set('X-Permitted-Cross-Domain-Policies', permittedCrossDomainPolicies);
            }

            return Promise.resolve(
                new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                })
            );
        };
    };
}

/**
 * Convert camelCase to kebab-case for CSP directives.
 */
function camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Preset: Strict security (recommended for production)
 */
export function strictSecurity(): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return securityHeaders({
        contentSecurityPolicy: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
        strictTransportSecurity: {
            maxAge: 63072000, // 2 years
            includeSubDomains: true,
            preload: true,
        },
        frameOptions: 'DENY',
        referrerPolicy: 'no-referrer',
        permissionsPolicy: {
            camera: [],
            microphone: [],
            geolocation: [],
            payment: [],
        },
    });
}

/**
 * Preset: Relaxed security (for development)
 */
export function relaxedSecurity(): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return securityHeaders({
        contentSecurityPolicy: false,
        strictTransportSecurity: false,
        frameOptions: 'SAMEORIGIN',
        xssProtection: '1; mode=block',
    });
}

