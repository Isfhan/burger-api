# @burger-api/cli

The official CLI for [BurgerAPI](https://burger-api.com): create projects, add
hooks and plugins, run a dev server, and build for production.

> **1.0.0-beta is a new CLI for the new BurgerAPI.** It is a rewrite that goes
> with `burger-api@1.0.0-beta`. Coming from `0.9.9`? Read the
> [migration guide](https://burger-api.com/docs/migration).
> Found a problem? [Open an issue](https://github.com/isfhan/burger-api/issues).

## Install

Requires [Bun](https://bun.sh) 1.4.4+.

```bash
bun add -g @burger-api/cli

# or run it without installing
bunx @burger-api/cli create my-api
```

Or install the standalone executable (no Bun needed to run the CLI):

```bash
# macOS, Linux, WSL
curl -fsSL https://burger-api.com/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://burger-api.com/install.ps1 | iex
```

Executables are also on [GitHub Releases](https://github.com/isfhan/burger-api/releases/latest).
Check the install with `burger-api --version`.

## Quick start

```bash
burger-api create my-api
cd my-api
bun run dev
```

Your API runs at http://localhost:4000, with docs at `/docs`.

## Commands

| Command | What it does |
| --- | --- |
| `create <name>` | Create a new project |
| `dev` | Run the dev server, restarting on changes |
| `start` | Run the production build |
| `build [file]` | Bundle the app for production |
| `build:exec [file]` | Compile to a standalone executable |
| `generate` (`g`) | Create a route, hook, plugin or WebSocket route |
| `add <names...>` | Add official hooks or plugins |
| `list` (`ls`) | List official hooks and plugins |
| `skills` | Install AI agent skills |
| `inspect` | Show the routes, hooks and plugins the app finds |
| `doctor` | Check the project for problems |

Run `burger-api <command> --help` for every option.

### `create <name>`

Asks a few questions (API routes, pages, WebSocket routes, debug mode, AI
skills), then creates the project and installs dependencies.

```bash
burger-api create my-api              # interactive
burger-api create my-api --yes        # all defaults, no questions
burger-api create my-api --lang js    # JavaScript project
burger-api create my-api --pages --ws # with pages and WebSocket routes
```

| Flag | Description |
| --- | --- |
| `-l, --lang <ts\|js>` | Project language (default: `ts`) |
| `-y, --yes`, `--defaults` | Use the default answers |
| `--pages` | Add page routes (`src/pages`) |
| `--ws` | Add WebSocket routes (`src/websocket`) |
| `--no-api` | Skip API routes |
| `--api-dir <dir>` | API folder under `src/` (default: `api`) |
| `--api-prefix <prefix>` | URL prefix for API routes (default: `/api`) |
| `--no-skills` | Skip the AI agent skills |

Feature flags skip the questions. In CI (no terminal), `create` never asks and
uses the defaults.

### `dev` and `start`

```bash
burger-api dev                 # port $PORT or 4000, entry src/index.ts
burger-api dev --port 8080
burger-api start               # runs .build/bundle/app.js after a build
```

`dev` watches the whole app folder, so new route folders work right away.

### `build` and `build:exec`

```bash
burger-api build src/index.ts                       # .build/bundle/app.js
burger-api build src/index.ts --target=cloudflare   # bun, node, cloudflare, deno, vercel
burger-api build:exec src/index.ts                  # .build/executable/<project>
burger-api build:exec src/index.ts --target bun-linux-x64
```

Routes are found at build time, so production never scans files. Settings come
from `burger.build.ts` (or `.js`) when present.

| `build` option | Description |
| --- | --- |
| `--target <target>` | `bun` (default), `node`, `cloudflare`, `deno` or `vercel` |
| `--outfile <path>` | Output file (default depends on the target) |
| `--minify` | Minify the output (`bun` and `node` only) |
| `--sourcemap <type>` | `inline`, `linked` or `none` (`bun` and `node` only) |

| `build:exec` option | Description |
| --- | --- |
| `--target <target>` | `bun-windows-x64`, `bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64` |
| `--outfile <path>` | Output file (`.exe` is added for Windows) |
| `--no-bytecode` | Turn off bytecode compilation |

An executable runs on a server with no Bun or Node installed. For an app with
pages, deploy the whole `.build/bundle/` folder.

### `generate`

```bash
burger-api generate route users
burger-api generate hook audit-log
burger-api generate plugin billing
burger-api generate ws chat
```

Files follow your project's language. If an official hook or plugin with that
name exists, the CLI tells you to `burger-api add` it instead.

### `add` and `list`

```bash
burger-api list
burger-api add cors logger rate-limiter
burger-api add jwt-auth session
```

`add` copies the code into your project's `ecosystem/` folder, so you can read
and change it, and prints the code to wire it in:

```ts
// src/hooks.ts
import { cors } from '../ecosystem/hooks/cors';

export const onRequest = [cors()];
```

```ts
// src/plugins.ts
import type { PluginRegistrar } from 'burger-api';
import { jwtAuth } from '../ecosystem/plugins/jwt-auth';

export default function (burger: PluginRegistrar) {
    burger.usePlugin(jwtAuth({ secret: process.env.JWT_SECRET! }));
}
```

Use `--force` to replace an existing install without a prompt.

### `skills`

```bash
burger-api skills install      # the burger-api skill
burger-api skills list
burger-api skills available
```

Skills teach AI coding agents how a BurgerAPI project works. They are installed
in `.agents/skills/` (OpenCode, Codex and others) and `.claude/skills/`
(Claude Code).

### `inspect` and `doctor`

```bash
burger-api inspect
burger-api doctor
burger-api doctor --json
```

`doctor` checks the project structure, config files, every route module, and
your Bun and Node versions. It exits with an error code when something is
wrong. `--json` prints one result object for tools and AI agents.

## Project layout

```
my-api/
├── burger.build.ts       # build settings (folders, prefixes)
├── AGENTS.md             # rules for AI coding agents
├── src/
│   ├── index.ts          # creates the app and starts the server
│   ├── hooks.ts          # global hooks
│   ├── plugins.ts        # burger.usePlugin(...)
│   ├── providers.ts      # burger.provide(...) → ctx.services
│   ├── openapi.config.ts # OpenAPI and docs UI settings
│   ├── types.ts          # app-wide types
│   └── api/              # API routes
└── tsconfig.json         # jsconfig.json for JavaScript projects
```

`src/pages/` and `src/websocket/` are added when you choose them.
`ecosystem/` is created by `burger-api add`.

## Troubleshooting

- **"Could not get hooks/plugins list from GitHub":** check your connection.
  The CLI falls back to its cache when it has one. Set `GITHUB_TOKEN` if
  GitHub rate-limits you.
- **"Entry file not found":** run the command from the project folder, or pass
  `--file`.
- **Something looks wrong:** run `burger-api doctor`.

## Contributing

See [CONTRIBUTING.md](https://github.com/isfhan/burger-api/blob/main/CONTRIBUTING.md).
To test the CLI against your local checkout, use `--local` (or
`BURGER_API_LOCAL=1`); see
[LOCAL_TESTING.md](https://github.com/isfhan/burger-api/blob/main/LOCAL_TESTING.md).

## License

[MIT](https://github.com/isfhan/burger-api/blob/main/LICENSE)
