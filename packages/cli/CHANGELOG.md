## 📣 Release Notes - Burger API CLI

All notable changes to the Burger API CLI will be documented in this file.

## Version 0.8.0 - (March 4, 2026)

### Added
- Added `burger.config.ts` generation in `burger-api create`, using project
  setup answers as defaults.
- Added build config resolver with convention defaults and optional
  `burger.config.ts` / `burger.config.js` overrides.
- Added route scanner and virtual-entry generation utilities for build-time
  route discovery.
- Added CLI test coverage for route parity, conflict detection, config
  resolution, virtual entry generation, and build output behavior.

### Changed
- Changed `build` and `build:exec` to use one AOT build pipeline with static
  route metadata.
- Changed default executable output to `.build/executable/<project>[.exe]`.
- Improved README docs for production build behavior and test commands.

### Fixed
- Fixed route conflict handling for invalid dynamic/wildcard folder
  combinations during build-time discovery.
- Fixed unsafe cross-package imports in CLI code.
- Made build-output tests stricter in CI so broken builds are caught early.

## Version 0.7.0 - (December 23, 2025)

### Added
- npm publishing support - CLI is now available on npm as `@burger-api/cli`
- Users can install via `bun add -g @burger-api/cli` or use `bunx @burger-api/cli`
- Lightweight npm package (~27KB) as alternative to 100MB executables
- GitHub Actions workflow for automated npm publishing (when organization is configured)


## Version 0.6.6 - (December 23, 2025)

### Added
- `.llm-context` folder to the project with AI context files
- `llms.txt`, `llms-small.txt`, and `llms-full.txt` files
- Updated README.md

## Version 0.6.3 - (December 17, 2025)

### Added
- GitHub Actions release workflow
- Updated README.md

## Version 0.1.0 - (December 14, 2025)

### Added
- Initial release of Burger API CLI
- `create` command to generate new projects with interactive prompts
- `list` command to show available middleware from ecosystem
- `add` command to download and install middleware
- `build` command to bundle projects to single JS file
- `build:exec` command to compile to standalone executable
- `serve` command for development server with hot reload
- Beautiful console output with colors and symbols
- Zero external dependencies for file operations (uses Bun's native APIs)
- Comprehensive documentation and examples
- Support for Windows, macOS, and Linux

### Technical Details
- Built with TypeScript and Bun.js
- Uses only 2 dependencies: `commander` and `@clack/prompts`
- All file downloads use Bun's native `fetch()` API
- All file operations use Bun's fast file system APIs
- All process spawning uses `Bun.spawn()`
- Comprehensive JSDoc comments throughout codebase

## Release Process

See [RELEASING.md](./RELEASING.md) for the release process.

---

## Change Categories

We use these categories to organize changes:

- **Added** - New features or commands
- **Changed** - Changes to existing functionality
- **Deprecated** - Features that will be removed in future
- **Removed** - Features that have been removed
- **Fixed** - Bug fixes
- **Security** - Security improvements

