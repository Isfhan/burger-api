/**
 * Cookie parser — re-exports `parseCookies` from `validation/validator.ts` so
 * there is a single source of truth (RFC 6265 quoted values,
 * percent-decoding). Kept for internal imports.
 */
export { parseCookies } from '../validation/validator.js';
