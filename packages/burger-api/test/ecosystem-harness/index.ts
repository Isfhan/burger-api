/**
 * Spawned by ecosystem-middleware-smoke tests. Select middleware via TEST_MW.
 */
import { Burger, setDir } from '../../src/index';
import type { Middleware } from '../../src/types/index';
import { cors } from '../../../../ecosystem/middlewares/cors/cors';
import { logger } from '../../../../ecosystem/middlewares/logger/logger';
import { rateLimit } from '../../../../ecosystem/middlewares/rate-limiter/rate-limiter';
import { compress } from '../../../../ecosystem/middlewares/compression/compression';
import { strictSecurity } from '../../../../ecosystem/middlewares/security-headers/security-headers';
import { jwt } from '../../../../ecosystem/middlewares/jwt-auth/jwt-auth';
import { apiKey } from '../../../../ecosystem/middlewares/api-key-auth/api-key-auth';
import { requestTimeout } from '../../../../ecosystem/middlewares/timeout/timeout';
import { publicCache } from '../../../../ecosystem/middlewares/cache/cache';
import { bodySizeLimiter } from '../../../../ecosystem/middlewares/body-size-limiter/body-size-limiter';

const name = process.env.TEST_MW ?? 'cors';

const middlewareByName: Record<string, Middleware> = {
    cors: cors({ origin: '*' }),
    logger: logger(),
    'rate-limiter': rateLimit({ windowMs: 60_000, maxRequests: 3 }),
    compression: compress({ threshold: 1, encodings: ['gzip', 'deflate'] }),
    'security-headers': strictSecurity(),
    'jwt-auth': jwt({ secret: 'ecosystem-harness-jwt-secret' }),
    'api-key-auth': apiKey({ keys: ['harness-key'] }),
    timeout: requestTimeout({ ms: 100 }),
    cache: publicCache(120),
    'body-size-limiter': bodySizeLimiter({ maxSize: 200, mode: 'stream' }),
};

const mw = middlewareByName[name];
if (!mw) {
    console.error(`Unknown TEST_MW: ${name}`);
    process.exit(1);
}

const port = Number(process.env.PORT) || 4000;

const burger = new Burger({
    title: 'Ecosystem harness',
    description: 'Middleware smoke tests',
    apiDir: setDir(import.meta.dir, 'api'),
    globalMiddleware: [mw],
    debug: false,
});

burger.serve(port);
