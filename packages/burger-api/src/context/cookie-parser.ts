/**
 * Cookie parser — re-exported from the canonical implementation in
 * `validation/validator.ts` so there is a single source of truth.
 *
 * The validation parser handles RFC 6265 quoted cookie-values and
 * percent-decoding; this module exists only for backward compatibility
 * with internal imports.
 */
export { parseCookies } from '../validation/validator.js';
