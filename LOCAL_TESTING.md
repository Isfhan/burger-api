# Test the CLI locally with `bun link`

Use this to try the CLI and framework from your checkout, before anything is
published to npm.

## 1. One-time setup

From the repo root:

```bash
bun install

# Build the framework (the CLI and new projects use its dist/)
cd packages/burger-api && bun run build && bun link
cd ../cli && bun link
cd ../node-server && bun run build && bun link   # only for --target node
cd ../..
```

`bun link` in `packages/cli` also puts the `burger-api` command on your PATH.
Check it:

```bash
burger-api --version
```

## 2. Turn on local mode

Local mode makes the CLI use your checkout instead of npm and GitHub:

- `create` adds `burger-api` and `@burger-api/cli` as `link:` dependencies
- `add`, `list`, `skills` and `generate hook|plugin` read from your
  checkout's `ecosystem/` folder

Pick one:

```bash
# Per command
burger-api create my-app --local

# For the whole shell (add to ~/.bashrc or ~/.zshrc to keep it)
export BURGER_API_LOCAL=1
```

Every command prints `[i] Local mode: <path to your checkout>` when it is on.

## 3. Create and run a test project

Create it outside the repo:

```bash
cd ~/Desktop
burger-api create my-app --local
cd my-app

burger-api dev        # http://localhost:4000/api and /docs
```

Try the other commands:

```bash
burger-api list --local
burger-api add cors logger jwt-auth --local
burger-api generate route posts
burger-api generate ws chat
burger-api skills install burger-api --local --force
burger-api doctor
burger-api inspect

burger-api build      # then:
burger-api start
burger-api build:exec # standalone binary in .build/executable/
```

## 4. After you change the code

| You changed | Do this |
| --- | --- |
| `packages/cli/src` | Nothing. The linked command runs the source. |
| `packages/burger-api/src` | `cd packages/burger-api && bun run build` |
| `ecosystem/` | Nothing in local mode (re-run `add` / `skills install --force`). |

## 5. Run the automated tests

```bash
bun run test:all              # everything, fast
bun run test:e2e:full         # real projects on Bun, Node 24, Deno, wrangler
E2E_FULL=1 bun run test:all   # both
```

`test:e2e:full` needs Node 24+, Deno and wrangler for the node, deno and
cloudflare targets. Missing tools are skipped with a message.

## Troubleshooting

- **`No version matching "^1.0.0-beta"`** during `create`: you forgot
  `--local` (or `BURGER_API_LOCAL=1`).
- **`... is not registered with bun link`**: run `bun link` in
  `packages/burger-api` and `packages/cli` (step 1).
- **Old framework behaviour in your project**: rebuild
  `packages/burger-api` (step 4).
- **Undo the links**: `bun unlink` in `packages/burger-api`, `packages/cli`
  and `packages/node-server`.
