import type { Hook } from 'burger-api';
import { cors } from '../../../../../ecosystem/hooks/cors/cors';
import { logger } from '../../../../../ecosystem/hooks/logger/logger';
import { rateLimit } from '../../../../../ecosystem/hooks/rate-limiter/rate-limiter';
import { compress } from '../../../../../ecosystem/hooks/compression/compression';
import { strictSecurity } from '../../../../../ecosystem/hooks/security-headers/security-headers';
import { requestTimeout } from '../../../../../ecosystem/hooks/timeout/timeout';
import { publicCache } from '../../../../../ecosystem/hooks/cache/cache';
import { bodySizeLimiter } from '../../../../../ecosystem/hooks/body-size-limiter/body-size-limiter';

const name = process.env.TEST_MW ?? 'cors';

const hooksByName: Record<string, Hook> = {
    cors: cors({ origin: '*' }),
    logger: logger(),
    'rate-limiter': rateLimit({ windowMs: 60_000, maxRequests: 3 }),
    compression: compress({ threshold: 1, encodings: ['gzip', 'deflate'] }),
    'security-headers': strictSecurity(),
    timeout: requestTimeout({ ms: 100 }),
    cache: publicCache(120),
    'body-size-limiter': bodySizeLimiter({ maxSize: 200, mode: 'stream' }),
};

const hook = hooksByName[name];
if (!hook) {
    console.error(`Unknown TEST_MW: ${name}`);
    process.exit(1);
}

// Self-contained: dynamic hook selection per route (test fixture pattern).
export const beforeRoute = [hook];
