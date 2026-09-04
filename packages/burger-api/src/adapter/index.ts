// Runtime-agnostic adapter contract only — no value exports here. The
// concrete `BunAdapter` lives at `burger-api/adapter/bun` and imports the
// `bun` runtime package at module scope, so re-exporting it from this
// barrel would make plain `burger-api/adapter` crash on import under any
// non-Bun runtime (Node, Cloudflare Workers, Deno, Vercel). Import
// `burger-api/adapter/bun` directly when you specifically need `BunAdapter`.
export type {
    AdapterStartOptions,
    RuntimeAdapter,
    ServerHandle,
} from './types.js';
