/**
 * Versions of the official hooks and plugins. `burger-api add` copies each
 * one's package.json into the project, so `doctor` can compare a copy with
 * these. A test keeps this table equal to ecosystem/*\/*\/package.json.
 */
export const ECOSYSTEM_VERSIONS: Record<string, string> = {
    'body-size-limiter': '0.1.0',
    cache: '0.1.0',
    compression: '0.1.0',
    cors: '0.1.0',
    logger: '0.1.0',
    'rate-limiter': '0.1.0',
    'security-headers': '0.1.0',
    timeout: '0.1.0',
    'api-key': '0.2.0',
    'basic-auth': '0.2.0',
    env: '0.1.0',
    'jwt-auth': '0.2.0',
    oidc: '0.2.0',
    session: '0.2.0',
};

/**
 * Add-ons whose older copies have a security problem, and the first fixed
 * version. Copies older than that make `doctor` fail.
 */
export const SECURITY_FIXES: Record<
    string,
    { fixedIn: string; problem: string; marker: RegExp }
> = Object.fromEntries(
    ['api-key', 'basic-auth', 'jwt-auth', 'oidc', 'session'].map((name) => [
        name,
        {
            fixedIn: '0.2.0',
            problem:
                'this copy checks credentials after request validation, so a ' +
                'request without credentials can get a 422 that describes ' +
                'the route schema instead of a 401',
            // Fixed copies authenticate in `transform` and have no
            // beforeRoute hook; every copy before the fix has one.
            marker: /\bbeforeRoute\s*:/,
        },
    ])
);
