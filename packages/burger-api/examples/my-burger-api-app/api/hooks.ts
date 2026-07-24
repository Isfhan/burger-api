import { globalLogger, authGuard, rateLimiter, corsMiddleware } from '../middleware';

export const beforeRoute = [globalLogger, corsMiddleware, rateLimiter, authGuard];
