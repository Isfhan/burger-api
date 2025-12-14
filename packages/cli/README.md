# 🍔 Burger API CLI

Simple command-line tool for creating and managing Burger API projects.

## Installation

### Using Bun (Recommended)

```bash
bun install -g @burger-api/cli
```

### Using npm

```bash
npm install -g @burger-api/cli
```

### Verify Installation

```bash
burger-api --version
```

## Quick Start

Create a new project in 30 seconds:

```bash
# Create a new project
burger-api create my-awesome-api

# Navigate to your project
cd my-awesome-api

# Start development server
bun run dev

# Open http://localhost:3000 in your browser
```

That's it! Your Burger API server is running! 🎉

---

## Commands

### `burger-api create <project-name>`

Create a new Burger API project with interactive prompts.

**Example:**
```bash
burger-api create my-api
```

The CLI will ask you:
- Do you need API routes? (yes/no)
- Do you need Page routes? (yes/no)
- Which template? (basic/full/minimal)
- Initialize git? (yes/no)

After answering, your project will be created with all files and dependencies installed!

**What you get:**
- ✅ Full project structure
- ✅ TypeScript configured
- ✅ Dependencies installed
- ✅ Example routes
- ✅ Ready to run!

---

### `burger-api list`

Show all available middleware you can add to your project.

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

**After adding:**
The CLI shows you exactly how to use the middleware in your project:

```typescript
import { Burger } from "burger-api";
import { cors } from "./middleware/cors/cors";
import { logger } from "./middleware/logger/logger";

const app = new Burger({
    apiDir: "./api",
    globalMiddleware: [
        logger(),
        cors(),
    ],
});
```

---

### `burger-api build <file>`

Bundle your project into a single JavaScript file.

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
- `--outfile <path>` - Output file path (default: `.build/bundle.js`)
- `--minify` - Minify the output for smaller file size
- `--sourcemap <type>` - Generate sourcemaps (inline, linked, or none)
- `--target <target>` - Target environment (e.g., bun, node)

**Output:**
```
✓ Build completed successfully!
  Output: .build/bundle.js
  Size: 42.5 KB
```

---

### `burger-api build:executable <file>`

Compile your project to a standalone executable that runs without Bun installed!

**Example:**
```bash
# Build for current platform
burger-api build:executable index.ts

# Build for Windows
burger-api build:executable index.ts --target bun-windows-x64

# Build for Linux
burger-api build:executable index.ts --target bun-linux-x64

# Build for Mac (ARM)
burger-api build:executable index.ts --target bun-darwin-arm64

# Custom output name
burger-api build:executable index.ts --outfile my-server.exe
```

**Options:**
- `--outfile <path>` - Output file path
- `--target <target>` - Target platform
- `--minify` - Minify the output (enabled by default)
- `--no-bytecode` - Disable bytecode compilation

**Targets:**
- `bun-windows-x64` - Windows (64-bit)
- `bun-linux-x64` - Linux (64-bit)
- `bun-linux-arm64` - Linux (ARM 64-bit)
- `bun-darwin-x64` - macOS (Intel)
- `bun-darwin-arm64` - macOS (Apple Silicon)

**Output:**
```
✓ Compilation completed successfully!
  Executable: .build/my-api.exe
  Size: 45.2 MB

  Your standalone executable is ready to run!
  Run it: .build/my-api.exe
```

**Use case:**
Perfect for deploying your API to production servers without installing Bun or Node.js!

---

### `burger-api serve`

Start a development server with hot reload (auto-restart on file changes).

**Example:**
```bash
# Default (port 3000, index.ts)
burger-api serve

# Custom port
burger-api serve --port 4000

# Custom entry file
burger-api serve --file server.ts

# Both
burger-api serve --port 8080 --file app.ts
```

**Options:**
- `-p, --port <port>` - Port to run on (default: 3000)
- `-f, --file <file>` - Entry file (default: index.ts)

**What you'll see:**
```
→ Starting development server...

✓ Server running on http://localhost:3000
ℹ Press Ctrl+C to stop
  File changes will automatically restart the server
```

**Pro tip:** Edit your code and save - the server restarts automatically! No need to manually restart.

---

### `burger-api upgrade`

Update the CLI to the latest version.

**Example:**
```bash
burger-api upgrade
```

**What it does:**
1. Checks npm registry for latest version
2. Compares with your current version
3. Installs the update if available
4. Shows what's new

**Output (when update available):**
```
ℹ Current version: 0.1.0
ℹ Latest version:  0.2.0

→ Installing update...
✓ Update installed successfully!
✓ Upgraded to version 0.2.0
```

**Output (when up to date):**
```
✓ You are already on the latest version!
ℹ Current version: 0.1.0
```

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
import type { BurgerRequest } from 'burger-api';

export async function GET(req: BurgerRequest) {
    return Response.json({
        users: ['Alice', 'Bob', 'Charlie']
    });
}

export async function POST(req: BurgerRequest) {
    const body = await req.json();
    return Response.json({
        message: 'User created',
        data: body
    });
}
```

That's it! The route is automatically available at `/api/users`

## Common Workflows

### Workflow 1: Create and Run a Project

```bash
# 1. Create project
burger-api create my-api

# 2. Navigate to it
cd my-api

# 3. Start dev server
bun run dev

# 4. Make changes and see them instantly!
```

### Workflow 2: Add Middleware

```bash
# 1. See what's available
burger-api list

# 2. Add what you need
burger-api add cors logger rate-limiter

# 3. Use them in index.ts (CLI shows you how!)
```

### Workflow 3: Build for Production

```bash
# 1. Test your app works
burger-api serve

# 2. Build an executable
burger-api build:executable index.ts --target bun-linux-x64

# 3. Deploy to your server
scp .build/my-api user@server:/opt/
ssh user@server
chmod +x /opt/my-api
/opt/my-api
```

## Troubleshooting

### "burger-api: command not found"

**Solution:** Install the CLI globally:
```bash
bun install -g @burger-api/cli
```

### "Directory already exists"

**Solution:** Choose a different project name or remove the existing directory:
```bash
burger-api create my-api-v2
```

### "Could not get middleware list from GitHub"

**Solution:** Check your internet connection. The CLI needs internet to download middleware from GitHub.

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

Run `bun run dev` first to see any errors.

## Getting Help

Get help for any command:

```bash
burger-api --help                  # General help
burger-api create --help           # Command-specific help
```

**Resources:**
- Main website: https://burger-api.com
- GitHub: https://github.com/isfhan/burger-api
- Issues: https://github.com/isfhan/burger-api/issues

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

```bash
bun run build:win          # Windows
bun run build:linux        # Linux
bun run build:mac          # macOS
bun run build:all          # All platforms
```

### Testing

Test commands locally:

```bash
# Create a test project
bun run src/index.ts create test-app

# Test other commands
cd test-app
bun run ../src/index.ts list
bun run ../src/index.ts add cors
bun run ../src/index.ts serve
```

### Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test everything manually
5. Submit a Pull Request

**Guidelines:**
- Use simple, beginner-friendly language
- Add comments explaining your code
- Test all commands before submitting
- Update README if adding new features

### Design Principles

- **Minimal dependencies** - Only use `commander` and `@clack/prompts`
- **Beautiful output** - Use colors and symbols for clarity
- **Simple language** - No jargon, clear explanations
- **Well commented** - Explain why, not just what

---

## Release Process

For maintainers releasing new versions:

1. **Update versions** in `package.json`, `src/index.ts`, and `src/commands/upgrade.ts`
2. **Update CHANGELOG.md** with all changes
3. **Build executables**: `bun run build:all`
4. **Create GitHub release** with executables attached
5. **Publish to npm**: `npm publish --access public`

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

## Technical Details

**Built with:**
- TypeScript for type safety
- Bun.js for speed and native APIs
- Commander for CLI framework
- @clack/prompts for beautiful prompts

**Zero external dependencies for:**
- File operations (uses `Bun.write()`)
- Downloads (uses native `fetch()`)
- Process spawning (uses `Bun.spawn()`)

**Supported platforms:**
- Windows (x64)
- Linux (x64, ARM64)
- macOS (Intel, Apple Silicon)

---

## License

MIT License - See [LICENSE](../../LICENSE) for details.

**Built with ❤️ for the Burger API community**
