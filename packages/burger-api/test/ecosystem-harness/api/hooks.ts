import type { Hook } from '../../../src/lifecycle/types';
import { cors } from '../../../../../ecosystem/hooks/cors/cors';
import { logger } from '../../../../../ecosystem/hooks/logger/logger';
import { rateLimit } from '../../../../../ecosystem/hooks/rate-limiter/rate-limiter';
import { compress } from '../../../../../ecosystem/hooks/compression/compression';
import { strictSecurity } from '../../../../../ecosystem/hooks/security-headers/security-headers';
import { jwt } from '../../../../../ecosystem/hooks/jwt-auth/jwt-auth';
import { apiKey } from '../../../../../ecosystem/hooks/api-key-auth/api-key-auth';
import { requestTimeout } from '../../../../../ecosystem/hooks/timeout/timeout';
import { publicCache } from '../../../../../ecosystem/hooks/cache/cache';
import { bodySizeLimiter } from '../../../../../ecosystem/hooks/body-size-limiter/body-size-limiter';

const name = process.env.TEST_MW ?? 'cors';

const middlewareByName: Record<string, Hook> = {
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

// Self-contained: dynamic middleware selection per route (test fixture pattern).
export const beforeRoute = [mw];
