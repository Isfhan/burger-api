// Runtime-agnostic adapter contract only — no value exports here. Re-exporting
// `BunAdapter` would pull in the `bun` package and crash non-Bun runtimes.
// Import `burger-api/adapter/bun` directly when you need it.
export type {
    AdapterStartOptions,
    RuntimeAdapter,
    ServerHandle,
} from './types.js';
