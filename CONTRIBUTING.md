# Contributing to BurgerAPI

Thank you for investing your time in contributing to BurgerAPI! Any
contribution you make will be greatly appreciated.

Read our [Code of Conduct](./CODE_OF_CONDUCT.md) to keep our community
approachable and respectable.

## Setup Local Development Environment

BurgerAPI requires [Bun](https://bun.sh) (version 1.3.0 or later). Make sure
you have the [latest version of Bun](https://bun.sh/docs/installation)
installed.

1.  Clone the repository:

    ```bash
    git clone https://github.com/isfhan/burger-api.git
    cd burger-api
    ```

2.  Install dependencies:

    ```bash
    bun install
    ```

3.  Run the development server:

    ```bash
    bun run dev
    ```

## Testing

All tests use [Bun's test runner](https://bun.sh/docs/cli/test).

```bash
# Full suite (framework + CLI + typecheck + route-sync)
bun run test:all

# Framework only
bun run test:framework

# CLI only
bun run test:cli

# Route-sync (ensures dev and production routing match)
bun run test:route-sync

# Within a specific package
cd packages/burger-api && bun test
```

When changing route or path conversion logic, always run `bun run test:route-sync`
from the repo root and update both the framework and CLI implementations if the
test fails.

## Typecheck

```bash
bun run typecheck
```

## Pull Request Guidelines

- Base your work on the `main` branch.
- Verify the full test suite passes before requesting review.
- Follow the existing code style and conventions.
- Add tests for new features.
- Update documentation as needed.
- Keep PRs focused on a single concern.

### Adding New Features

- Provide a reason why you would like to add this feature. Open an issue first
  to discuss with maintainers.
- Add test cases to cover the core functionality.

### Fixing Bugs

- Include a link to the issue being fixed in the PR description.
- Provide a detailed description of the bug.
- Add appropriate test coverage.

## Code Style

- The project uses [Prettier](https://prettier.io/) for consistent formatting.
- TypeScript with strict typing.
- ESM modules only (`import`/`export`).
- Bun-native APIs (`Bun.serve`, `Bun.write`, `Bun.file`) over Node.js
  alternatives.



## Documentation

- Framework: `packages/burger-api/README.md`
- CLI: `packages/cli/README.md`
- Website: [burger-api.com](https://burger-api.com)

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
