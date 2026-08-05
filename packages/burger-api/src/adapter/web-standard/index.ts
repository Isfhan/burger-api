/**
 * Web-Standard (WinterCG) adapter entry.
 *
 * Unlike `adapter/bun/`, this module contains no Bun references: it is the
 * portable fetch surface used by Cloudflare Workers, Vercel, Deno Deploy,
 * and Node 24+.
 */
export { toFetchHandler } from './fetch-handler';
export type { FetchHandlerEntry } from './fetch-handler';
