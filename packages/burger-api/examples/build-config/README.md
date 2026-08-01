# Build Config Example

Demonstrates `burger.build.ts` — the build-time configuration file read by the CLI for AOT production builds.

## Convention

- `burger.build.ts` — lives at project root, exports `BuildConfig`
- The CLI uses it to locate `apiDir`, `pageDir`, prefixes, etc.

## Run

```bash
bun run src/index.ts
```

## Build

```bash
burger build
```
