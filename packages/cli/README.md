# BurgerAPI CLI 👨‍💻

A Command-Line Tool for Creating and Managing BurgerAPI Projects.

## Installation

### Option 1: Bun Global Installation (Recommended if you have Bun installed)

**Global Installation:**

```bash
bun add -g @burger-api/cli
```

**Or use with bunx (No Installation Needed):**

```bash
bunx @burger-api/cli create my-project
```

### Option 2: Standalone Executable (Alternative Installation Method)

**macOS, Linux, WSL:**

```bash
curl -fsSL https://burger-api.com/install.sh | bash
```

**Windows PowerShell:**

```powershell
irm https://burger-api.com/install.ps1 | iex
```

### Option 3: Manual Download (Alternative Installation Method)

1. Download the executable for your platform from
   [GitHub Releases](https://github.com/isfhan/burger-api/releases/latest)
2. Add to PATH
3. Make executable (Linux/macOS): `chmod +x burger-api`

### Verify Installation (To Check if the CLI is Installed Correctly)

```bash
burger-api --version
```

## Available Commands (To Manage Your Project)

### `burger-api create <project-name>`

Create a new Burger API project with interactive prompts.

**Questions You Will Be Asked:**

-   Do you need API routes? (yes/no)
-   API directory name (default: api)
-   API route prefix (default: /api)
-   Enable debug mode? (yes/no)
-   Do you need Page routes? (yes/no)
-   Page directory name (default: pages)
-   Page route prefix (default: /)
-   Add AI agent skills? (recommended for agentic IDEs, default: yes)

After answering, your project will be created with all files and dependencies
installed!

**What you get:**

-   ✅ Full project structure
-   ✅ TypeScript configured
-   ✅ Dependencies installed
-   ✅ `burger.build.ts` generated from your answers (build-time only)
-   ✅ Example routes
-   ✅ Ready to run!
-   ✅ AI agent skills installed at `.agents/skills/burger-api/` (when opted in)
-   ✅ When page routes are enabled, the sample `index.html` matches your choices
    (API prefix for “Try API”, and edit hints for your API/page directories)

Generated config example:

```ts
export default {
    apiDir: './src/api',
    pageDir: './src/pages',
    apiPrefix: '/api',
    pagePrefix: '/',
    debug: false,
};
```

Edit `burger.build.ts` anytime to change routes, prefixes, or debug mode.
Runtime options belong in `new Burger({...})`, `src/plugins.ts`, and route `config.ts`.

---

### `burger-api list`

Show official ecosystem packages you can add (hooks under `ecosystem/hooks/`,
plugins under `ecosystem/plugins/` when available).

**Hooks** control the request lifecycle. **Plugins** extend the application.
They are separate concepts.

**Example:**

```bash
burger-api list
```

**Alias:**

```bash
burger-api ls
```

**Output:**

```
Available Middleware
────────────────────────────────

Name            Description
─────────────────────────────────────────────────
cors            Cross-Origin Resource Sharing
logger          Request/response logging
rate-limiter    Request rate limiting
jwt-auth        JWT authentication
api-key-auth    API key authentication
compression     Response compression
...
```

---

### `burger-api add <middleware...>`

Add one or more middleware to your project.

**Examples:**

```bash
# Add a single middleware
burger-api add cors

# Add multiple middleware at once
burger-api add cors logger rate-limiter

# Add authentication
burger-api add jwt-auth api-key-auth
```

**What it does:**

1. Downloads middleware code from GitHub
2. Copies files to your `middleware/` folder
3. Shows you example code to use it
4. You can modify the code to fit your needs!

**After adding:** The CLI shows you exactly how to use the middleware in your
project:

```typescript
import { Burger } from 'burger-api';
import { cors } from './middleware/cors/cors';
import { logger } from './middleware/logger/logger';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [logger(), cors()],
});
```

---

### `burger-api skills`

Manage AI agent skills for your project. Skills help AI-assisted IDEs understand
your BurgerAPI project structure.

**Subcommands:**

| Command | Description |
|---|---|
| `burger-api skills install [name]` | Download a skill (defaults to `burger-api`) |
| `burger-api skills list` | Show locally installed skills |
| `burger-api skills available` | List remote skills available on GitHub |

**Examples:**

```bash
# Install the default burger-api skill
burger-api skills install

# List what's installed
burger-api skills list

# See what skills are available
burger-api skills available
```

**What gets installed:**

```
.agents/skills/burger-api/
├── SKILL.md              # Main skill definition
└── references/           # Reference documentation
    ├── routing.md
    ├── validation.md
    ├── middleware.md
    ├── cli.md
    └── openapi.md
```

**Compatible agents:** Skills in `.agents/skills/` are automatically detected by
Cursor, Claude Code, OpenCode, OpenAI Codex, GitHub Copilot, and any tool
supporting the agentskills.io standard.

---

### `burger-api build <file>`

Bundle your project with route discovery prepared ahead of time (AOT) — routes
are found when the app is built, not while it is running.
The CLI scans routes first, generates a virtual entry file, then runs Bun build.

**Example:**

```bash
# Basic build
burger-api build index.ts

# Build with minification
burger-api build index.ts --minify

# Custom output location
burger-api build index.ts --outfile dist/app.js

# With sourcemaps
burger-api build index.ts --sourcemap linked
```

**Options:**

-   `--outfile <path>` - Output file path (default: `.build/bundle/app.js`)
-   `--minify` - Minify the output for smaller file size
-   `--sourcemap <type>` - Generate sourcemaps (inline, linked, or none)
-   `--target <target>` - Target environment (e.g., bun, node)

Build config is loaded from `burger.config.ts` or `burger.config.js` when
present. If no config exists, the CLI uses defaults:
`apiDir=./src/api`, `pageDir=./src/pages`, `apiPrefix=/api`, `pagePrefix=/`.

**Output:**

```
✓ Build completed successfully!
  Output: .build/bundle/app.js
  Size: 42.5 KB
```

- API-only apps: `app.js` is usually enough to deploy.
- Apps with pages/assets: deploy the full `.build/bundle/` directory.

---

### `burger-api build:exec <file>`

Compile your project to a standalone executable that runs without Bun installed!

**Example:**

```bash
# Build for current platform
burger-api build:exec index.ts

# Build for Windows
burger-api build:exec index.ts --target bun-windows-x64

# Build for Linux
burger-api build:exec index.ts --target bun-linux-x64

# Build for Mac (ARM)
burger-api build:exec index.ts --target bun-darwin-arm64

# Custom output name
burger-api build:exec index.ts --outfile my-server.exe
```

**Options:**

-   `--outfile <path>` - Output file path
-   `--target <target>` - Target platform
-   `--minify` - Minify the output (enabled by default)
-   `--no-bytecode` - Disable bytecode compilation

**Targets:**

-   `bun-windows-x64` - Windows (64-bit)
-   `bun-linux-x64` - Linux (64-bit)
-   `bun-linux-arm64` - Linux (ARM 64-bit)
-   `bun-darwin-x64` - macOS (Intel)
-   `bun-darwin-arm64` - macOS (Apple Silicon)

**Output:**

```
✓ Compilation completed successfully!
  Executable: .build/executable/<project>.exe
  Size: 45.2 MB

  Your standalone executable is ready to run!
  Run it: .build/executable/<project>.exe
```

**Use case:** Perfect for deploying your API to production servers without
installing Bun or Node.js!

---

### `burger-api serve`

Start a development server with hot reload (auto-restart on file changes).

**Example:**

```bash
# Default (port 4000, index.ts)
burger-api serve

# Custom port
burger-api serve --port 4000

# Custom entry file
burger-api serve --file server.ts

# Both
burger-api serve --port 8080 --file app.ts
```

**Options:**

-   `-p, --port <port>` - Port to run on (default: 4000)
-   `-f, --file <file>` - Entry file (default: index.ts)

**What you'll see:**

```
→ Starting development server...

✓ Server running on http://localhost:4000
ℹ Press Ctrl+C to stop
  File changes will automatically restart the server
```

**Pro tip:** Edit your code and save - the server restarts automatically! No
need to manually restart.

---

## Project Structure

When you create a project, this is what you get:

```
my-awesome-api/
├── api/                    # Your API routes
│   └── route.ts           # Example route
├── pages/                 # Your HTML pages (optional)
│   └── index.html         # Example page
├── middleware/            # Middleware folder
│   └── index.ts          # Export middleware here
├── .agents/               # AI agent skills (optional)
│   └── skills/
│       └── burger-api/    # BurgerAPI skill for agentic IDEs
│           ├── SKILL.md
│           └── references/
├── index.ts              # Main server file
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── .gitignore           # Git ignore rules
└── .prettierrc          # Code formatting
```

### Adding Routes

Create a new file in the `api/` folder:

```typescript
// api/users/route.ts
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        users: ['Alice', 'Bob', 'Charlie'],
    });
}

export async function POST(ctx: BurgerContext) {
    const body = await ctx.request.json();
    return Response.json({
        message: 'User created',
        data: body,
    });
}
```

That's it! The route is automatically available at `/api/users`

### Adding Pages

Create a new file in the `pages/` folder:

```html
<!-- pages/about.html -->
<html>
    <body>
        <h1>About Page</h1>
        <p>This is the about page.</p>
    </body>
</html>
```

That's it! The page is automatically available at `/about`

## Troubleshooting

### "Directory already exists"

**Solution:** Choose a different project name or remove the existing directory:

```bash
burger-api create my-api-v2
```

### "Could not get middleware list from GitHub"

**Solution:** Check your internet connection. The CLI needs internet to download
middleware from GitHub.

### "Entry file not found: index.ts"

**Solution:** Make sure you're in the project directory:

```bash
cd my-project
burger-api serve
```

### Build fails with errors

**Solution:** Check that:

1. You're in a Burger API project directory
2. The entry file exists
3. There are no TypeScript errors in your code
4. Route folder rules are valid (no mixed dynamic + wildcard siblings)

Run `bun run dev` first to see any errors.

If you use custom folders or prefixes, verify your `burger.config.ts` /
`burger.config.js` values.

### Cross-compilation fails from Windows (D:\ drive)

**Error:**

```
Failed to extract executable for 'bun-linux-x64-v1.3.4'. The download may be incomplete.
```

**Cause:** Bun's cross-compilation has a bug when working from non-system drives
on Windows (D:\, E:\, etc.).

**Solution:** Move your project to `C:\` drive. Cross-compilation works
correctly from the system drive.

**Example:**

```bash
# ❌ This fails if project is on D:\
cd D:\Coding\burger-api\packages\cli
bun run build:linux

# ✅ This works from C:\
cd C:\burger-api\packages\cli
bun run build:linux
```

## Getting Help

Get help for any command:

```bash
burger-api --help                  # General help
burger-api create --help           # Command-specific help
```

**Resources:**

-   Main website: https://burger-api.com
-   GitHub: https://github.com/isfhan/burger-api
-   Issues: https://github.com/isfhan/burger-api/issues

---

### Migration from `.llm-context`

Projects created with CLI version **0.9.8 and earlier** may have an
`ecosystem/.llm-context/` folder. Starting with 0.9.9, the CLI no longer
auto-installs this folder. To adopt the new skills format:

```bash
cd my-project
burger-api skills install
```

This downloads the burger-api skill to `.agents/skills/burger-api/` for
agentic IDEs. The old `ecosystem/.llm-context/` folder can be safely removed.

---

## Development

Want to contribute or develop locally?

### Setup

```bash
# Clone the repo
git clone https://github.com/isfhan/burger-api.git
cd burger-api/packages/cli

# Install dependencies
bun install

# Run locally
bun run src/index.ts --help
```

### Project Structure

```
packages/cli/
├── src/
│   ├── index.ts           # Main entry point
│   ├── commands/          # All CLI commands
│   ├── utils/             # Shared utilities
│   └── types/             # TypeScript types
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

### Build Executables

Build standalone executables for all platforms:

```bash
bun run build:win          # Windows (x64)
bun run build:linux        # Linux (x64)
bun run build:mac          # macOS (ARM64/Apple Silicon)
bun run build:mac-intel    # macOS (Intel x64)
bun run build:all          # All platforms
```

**Cross-Compilation from Windows:**

Bun supports cross-compilation - you can build Linux and macOS executables from
Windows using the `--target` flag:

```bash
# Build for Linux from Windows
bun build ./src/index.ts --compile --target bun-linux-x64 --outfile dist/burger-api-linux --minify

# Build for macOS ARM64 from Windows
bun build ./src/index.ts --compile --target bun-darwin-arm64 --outfile dist/burger-api-mac --minify

# Build for macOS Intel from Windows
bun build ./src/index.ts --compile --target bun-darwin-x64 --outfile dist/burger-api-mac-intel --minify
```

**Important: Windows D:\ Drive Bug**

If you see this error when cross-compiling from Windows:

```
Error: Failed to extract executable for 'bun-linux-x64-v1.3.4'. The download may be incomplete.
```

**Cause:** Cross-compilation fails when working from non-system drives (like
`D:\`) on Windows due to cross-volume file move operations failing when Bun
tries to cache the downloaded base executable.

**Solution:** Move your project to the `C:\` drive and run the build from there.
Cross-compilation works correctly from the system drive.

**Caution: `--bytecode` Flag with Cross-Compilation**

The `--bytecode` flag improves startup time, but there are known issues where
cross-compiled executables with `--bytecode` may segfault on the target OS. If
you encounter crashes, rebuild without `--bytecode`. The build scripts use
`--minify` only for safety with cross-compilation.

### Testing

Run tests (from `packages/cli`):

```bash
# Run all CLI tests
bun run test

# Run build tests only (check production matches dev)
bun run test:build

# Run one test file
bun test test/build-output.test.ts
```

From the **repo root**, run all CLI tests with:

```bash
bun run test:cli
```

Optional: run the GitHub-backed `ls` exit integration test (skipped by default):

```bash
BURGER_API_CLI_LIST_EXIT_TEST=1 bun test test/cli-process-exit.test.ts
```

### Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test everything manually
5. Submit a Pull Request

**Guidelines:**

-   Use simple, beginner-friendly language
-   Add comments explaining your code
-   Test all commands before submitting
-   Update README if adding new features
-   Keep route rules in one place:
    - runtime/shared rules: `packages/burger-api/src/utils/pathConversion.ts`
    - scanner traversal: `packages/cli/src/utils/scanner.ts`
-   Run build tests when changing routing/build (keeps dev and production behavior the same):
    - `bun run test:build`
-   CLI: commands that should return to the shell when finished must not leave
    stray timers, unread pipes, or hung `fetch` work behind. Use the HTTP helper
    in `src/utils/github.ts` for outbound requests. `serve` is meant to stay
    running until you stop it.

### Design Principles

-   **Minimal dependencies** - Only use `commander` and `@clack/prompts`
-   **Beautiful output** - Use colors and symbols for clarity
-   **Simple language** - No jargon, clear explanations
-   **Well commented** - Explain why, not just what

## Technical Details

**Built with:**

-   TypeScript for type safety
-   Bun.js for speed and native APIs
-   Commander for CLI framework
-   @clack/prompts for beautiful prompts

**Zero external dependencies for:**

-   File operations (uses `Bun.write()`)
-   Downloads (uses native `fetch()`)
-   Process spawning (uses `Bun.spawn()`)

**Supported platforms:**

-   Windows (x64)
-   Linux (x64, ARM64)
-   macOS (Intel, Apple Silicon)

---

## License

MIT License - See [LICENSE](../../LICENSE) for details.

**Built with ❤️ for the BurgerAPI community**
