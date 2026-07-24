import { globalLogger, authGuard, rateLimiter, corsMiddleware } from '../middleware';

export const beforeHandle = [globalLogger, corsMiddleware, rateLimiter, authGuard];
