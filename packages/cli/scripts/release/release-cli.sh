#!/usr/bin/env bash

set -euo pipefail

# Absolute path of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Repo root (robust & clean)
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Read version using Bun
VERSION=$(bun -e "console.log(require('./packages/cli/package.json').version)")

if [[ -z "$VERSION" ]]; then
  echo "❌ Could not read CLI version using Bun"
  exit 1
fi

TAG="cli/v${VERSION}"

# Prevent duplicate tags
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists"
  exit 1
fi

echo "📦 Releasing CLI version: $VERSION"

# Create and push annotated tag
git tag -a "$TAG" -m "Release CLI v${VERSION}"
git push origin "$TAG"

echo "✅ Tag $TAG created and pushed"
