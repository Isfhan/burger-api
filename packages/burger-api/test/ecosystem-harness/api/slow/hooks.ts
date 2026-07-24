import { requestTimeout } from '../../../../../../ecosystem/hooks/timeout/timeout';

// Self-contained: timeout hook for the slow route.
export const beforeHandle = [requestTimeout({ ms: 100 })];
