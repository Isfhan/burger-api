import type { GlobalHooks } from 'burger-api';
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
//
// Explicitly annotated (not left to inference) so this example acts as a
// canary: if an ecosystem hook's exported type ever drifts from the
// GlobalHooks contract again, `tsc` catches it here, not just when a real
// user's project fails to compile.
export const onRequest: GlobalHooks['onRequest'] = [
    cors({ origin: '*', debug: true }),
];

export const beforeRoute: GlobalHooks['beforeRoute'] = [
    logger(),
    // Direct connections: provide a keyGenerator (e.g. an API key or
    // session id). Behind a proxy that overwrites X-Forwarded-For /
    // X-Real-IP, set trustProxy: true instead. Without either, the
    // limiter cannot identify a client and rejects with 403.
    rateLimit({
        windowMs: 60000,
        maxRequests: 100,
        keyGenerator: () => 'example-client',
    }),
    compress({ threshold: 512 }),
    securityHeaders(),
    requestTimeout({ ms: 10000 }),
    bodySizeLimiter({ maxSize: 1048576 }),
    noCache(),
];
