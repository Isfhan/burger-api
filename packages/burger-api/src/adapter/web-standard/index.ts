/**
 * Web-Standard (WinterCG) adapter entry.
 *
 * Contains no Bun references: the portable fetch surface used by Cloudflare
 * Workers, Vercel, Deno Deploy, and Node 24+.
 */
export { toFetchHandler } from './fetch-handler.js';
export type { FetchHandlerEntry } from './fetch-handler.js';
