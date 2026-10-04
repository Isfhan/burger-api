import { requestTimeout } from '../../../../../../ecosystem/hooks/timeout/timeout';

// Timeout hook for the slow route.
export const beforeRoute = [requestTimeout({ ms: 100 })];
