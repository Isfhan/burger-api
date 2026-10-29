# Publishing burger-api

`burger-api` is published to npm by GitHub Actions
(`.github/workflows/release-burger-api-npm.yml`) when a `burger-api/v*` tag is
pushed. Nobody runs `npm publish` by hand.

## Before you release

From the repo root:

```bash
bun install
bun run test:all             # every suite + typecheck
E2E_FULL=1 bun run test:all  # also the full CLI end-to-end tests
```

Then check what npm will receive:

```bash
cd packages/burger-api
bun run build
npm pack --dry-run           # lists every file in the tarball (only dist/)
```

To try the tarball in a real project:

```bash
npm pack                                  # writes burger-api-<version>.tgz
cd ../my-test-app && bun add ../burger-api/packages/burger-api/burger-api-<version>.tgz
```

## Release

1. Set `"version"` in `packages/burger-api/package.json` (for example
   `1.0.1`).
2. Add the release to `CHANGELOG.md` with its date.
3. Commit on `main` and push.
4. Tag and push the tag. The tag must match the version exactly:

   ```bash
   git tag burger-api/v1.0.1
   git push origin burger-api/v1.0.1
   ```

The workflow then:

1. checks that `package.json` matches the tag,
2. builds, typechecks and runs the example tests,
3. publishes with `npm publish --access public --provenance --tag latest`,
4. checks that the new version is on npm.

If a run fails after the tag is pushed, fix the problem and start the workflow
again from the Actions tab (**Run workflow**, with the same version). There is
no need to delete the tag.

## Order with the other packages

New projects install `burger-api` from npm, so publish it first:

1. `burger-api/v*`
2. `node-server/v*` (depends on `burger-api`)
3. `cli/v*` (scaffolds projects that depend on both)

## Versions

Follow [semver](https://semver.org): a patch for fixes, a minor for new
features, a major for breaking changes. Every release publishes under the
`latest` dist-tag, so `bun add burger-api` always installs the newest release.

## After the release

```bash
npm view burger-api dist-tags     # latest should be the new version
bunx @burger-api/cli create smoke-test --yes
cd smoke-test && bun run dev
```

## Setup (one time)

- Repository secret `NPM_TOKEN`: an npm automation token with publish access
  to `burger-api`.
- The workflow needs `id-token: write` permission for provenance (already set).
