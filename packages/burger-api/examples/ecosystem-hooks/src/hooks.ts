import { cors } from '../../../../../ecosystem/hooks/cors/cors';
import { logger } from '../../../../../ecosystem/hooks/logger/logger';
import { rateLimit } from '../../../../../ecosystem/hooks/rate-limiter/rate-limiter';
import { compress } from '../../../../../ecosystem/hooks/compression/compression';
import { securityHeaders } from '../../../../../ecosystem/hooks/security-headers/security-headers';
import { requestTimeout } from '../../../../../ecosystem/hooks/timeout/timeout';
import { bodySizeLimiter } from '../../../../../ecosystem/hooks/body-size-limiter/body-size-limiter';
import { noCache } from '../../../../../ecosystem/hooks/cache/cache';

// All hooks applied globally.
// CORS is in onRequest (pre-routing) so it handles OPTIONS preflight correctly.
export const onRequest = [
    cors({ origin: '*', debug: true }),
];

export const beforeRoute = [
    logger(),
    rateLimit({ windowMs: 60000, maxRequests: 100 }),
    compress({ threshold: 512 }),
    securityHeaders(),
    requestTimeout({ ms: 10000 }),
    bodySizeLimiter({ maxSize: 1048576 }),
    noCache(),
];
