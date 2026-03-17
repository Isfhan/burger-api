## 📣 Release Notes - Burger API CLI

All notable changes to the Burger API CLI will be documented in this file.

## Version 0.9.6 - (March 18, 2026)

-   ✨ **Create** – New projects get a config file (`burger.config.ts`) from
    your answers; the build uses this config when present.
-   🔨 **Build** – One build pipeline for both bundle and executable; routes
    are found at build time so production is fast and reliable.
-   📂 **Defaults** – Executable output: `.build/executable/<project>` (or
    `.exe` on Windows); bundle: `.build/bundle/app.js`.
-   🧪 **Tests** – New tests for routes, config, and build output; CI catches
    broken builds early.
-   🐛 **Fixed** – Invalid route combinations are caught at build time.
-   🐛 **Fixed** – Production build keeps your middleware and options (e.g.
    title, description) instead of dropping them.
-   📚 **Docs** – README updated with production build steps and test
    commands.

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

