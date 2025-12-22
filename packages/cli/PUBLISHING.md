# 📦 Publishing Guide for Burger API CLI

This guide covers the release process for `@burger-api/cli` executables using GitHub Actions.

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Building the Package](#-building-the-package)
- [Testing Locally](#-testing-locally)
- [Pre-release Checklist](#-pre-release-checklist)
- [Creating a Release](#-creating-a-release)
- [Version Management](#-version-management)
- [Post-release Testing](#-post-release-testing)
- [Troubleshooting](#-troubleshooting)

---

## ✅ Prerequisites

Before releasing, ensure you have:

- [Bun](https://bun.sh) installed (latest version)
- Git configured with your identity
- Write access to the repository
- All changes committed and pushed to main branch

```bash
# Verify Bun installation
bun --version

# Verify git status
git status
```

---

## 🔨 Building the Package

### Standard Build

```bash
# Navigate to CLI directory
cd packages/cli

# Install dependencies
bun install

# Build for your platform
bun run build:linux   # Linux
bun run build:win     # Windows
bun run build:mac     # macOS ARM64
bun run build:mac-intel # macOS Intel

# Build all platforms
bun run build:all
```

### Verify Build Output

```bash
# Check dist folder
ls -la dist/

# Should contain:
# - burger-api-linux (Linux executable)
# - burger-api.exe (Windows executable)
# - burger-api-mac (macOS ARM64 executable)
# - burger-api-mac-intel (macOS Intel executable)
```

### Clean Build

```bash
# Remove old build artifacts
rm -rf dist

# Rebuild from scratch
bun run build:all
```

---

## 🧪 Testing Locally

### Test Executable

```bash
# Build for your platform
cd packages/cli
bun run build:linux

# Make executable (Linux/macOS)
chmod +x dist/burger-api-linux

# Test the executable
./dist/burger-api-linux --version
./dist/burger-api-linux create --help
./dist/burger-api-linux list
```

### Test All Commands

```bash
# Test version
./dist/burger-api-linux --version

# Test create command
./dist/burger-api-linux create test-project

# Test list command
./dist/burger-api-linux list

# Test add command
./dist/burger-api-linux add cors

# Test build command
./dist/burger-api-linux build

# Test serve command
./dist/burger-api-linux serve
```

---

## ✅ Pre-release Checklist

Run through this checklist before every release:

### 1. Version Check

```bash
# Check current version
cat packages/cli/package.json | grep '"version"'

# Update if needed (see Version Management section)
cd packages/cli
npm version patch  # or minor/major
```

### 2. Update Documentation

```bash
# Update CHANGELOG.md with new version date and changes
# Update README.md if needed
# Ensure all features are documented
```

### 3. Test Locally

```bash
# Build and test
cd packages/cli
bun install
bun run build:linux
./dist/burger-api-linux --version

# Test all commands work
./dist/burger-api-linux create --help
```

### 4. Commit Changes

```bash
# Ensure all changes are committed
git status

# Commit if needed
git add .
git commit -m "chore(cli): prepare for release"
```

**✅ If all checks pass, you're ready to release!**

---

## 🚀 Creating a Release

The CLI uses **automated GitHub Actions** to build and release executables for all platforms.

### Step 1: Update Version

```bash
# Navigate to CLI directory
cd packages/cli

# Update version (choose appropriate bump)
npm version patch   # 0.6.4 -> 0.6.5 (bug fixes)
npm version minor   # 0.6.4 -> 0.7.0 (new features)
npm version major   # 0.6.4 -> 1.0.0 (breaking changes)

# This automatically:
# - Updates package.json version
# - Creates a git commit
# - Creates a git tag (cli/v0.6.5)
```

### Step 2: Update CHANGELOG.md

Edit `packages/cli/CHANGELOG.md` and add a new version entry:

```markdown
## Version 0.6.5 - (December 20, 2025)

### Fixed
- Fixed bug in create command
- Improved error handling

### Changed
- Updated dependencies
```

### Step 3: Commit Changes

```bash
# If you used npm version, the version commit is already created
# Just commit the CHANGELOG update
git add packages/cli/CHANGELOG.md
git commit -m "chore(cli): update changelog for v0.6.5"

# Or if you did manual version update:
git add packages/cli/package.json packages/cli/CHANGELOG.md
git commit -m "chore(cli): bump version to 0.6.5"
```

### Step 4: Push to Main

```bash
# Push commits to main branch
git push origin main
```

### Step 5: Create Release Tag

Create a git tag to trigger the GitHub Actions workflow:

#### Method 1: Using Release Script (Recommended)

The easiest way is to use the release script:

```bash
# From the repository root
./packages/cli/scripts/release/release-cli.sh
```

**What it does:**
- Automatically reads version from `packages/cli/package.json`
- Creates and pushes the CLI tag with correct format (`cli/v*`)
- Prevents duplicate tags
- Shows clear output

**Example output:**
```
📦 Releasing CLI version: 0.6.5
Enumerating objects: 1, done.
Counting objects: 100% (1/1), done.
Writing objects: 100% (1/1), 173 bytes | 173.00 KiB/s, done.
Total 1 (delta 0), reused 0 (delta 0), pack-reused 0 (from 0)
To https://github.com/Isfhan/burger-api.git
 * [new tag]         cli/v0.6.5 -> cli/v0.6.5
✅ Tag cli/v0.6.5 created and pushed
```

#### Method 2: Manual Tag Creation

If you prefer to create the tag manually:

```bash
# Get the version from package.json
VERSION=$(node -p "require('./packages/cli/package.json').version")

# Create annotated tag with cli/ prefix
git tag -a "cli/v${VERSION}" -m "Release CLI v${VERSION}"

# Push the tag (this triggers GitHub Actions)
git push origin "cli/v${VERSION}"
```

#### Method 3: Use GitHub's workflow_dispatch

1. Go to GitHub Actions tab
2. Select "Release CLI Executables" workflow
3. Click "Run workflow"
4. Enter version (e.g., `v0.6.5`)
5. Click "Run workflow"

### What Happens During Release

1. GitHub Actions checks out the code
2. Sets up Bun and Node.js
3. Installs dependencies
4. Builds executables for all platforms:
   - Linux (x64): `burger-api-linux`
   - Windows (x64): `burger-api.exe`
   - macOS (ARM64): `burger-api-mac`
   - macOS (Intel): `burger-api-mac-intel`
5. Generates SHA256 checksums for all executables
6. Creates GitHub Release with:
   - All platform executables
   - Checksums file
   - Release notes linking to CHANGELOG.md

---

## 🏷️ Version Management

### Semantic Versioning

The CLI follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes, major overhauls
- **MINOR** (0.7.0): New features, new commands (backward compatible)
- **PATCH** (0.6.5): Bug fixes, small improvements (backward compatible)

### Updating Version

```bash
# Navigate to CLI directory
cd packages/cli

# Patch version (0.6.4 -> 0.6.5)
# Use for: Bug fixes, documentation updates
npm version patch

# Minor version (0.6.4 -> 0.7.0)
# Use for: New features, non-breaking changes
npm version minor

# Major version (0.6.4 -> 1.0.0)
# Use for: Breaking changes, major overhauls
npm version major

# This automatically:
# 1. Updates package.json version
# 2. Creates a git commit
# 3. Creates a git tag (cli/v0.6.5, cli/v0.7.0, etc.)
```

### Manual Version Update

If you prefer to update manually:

```bash
# Edit package.json
# Change "version": "0.6.4" to "0.6.5"

# Update CHANGELOG.md
# Add new version entry with date

# Commit changes
git add packages/cli/package.json packages/cli/CHANGELOG.md
git commit -m "chore(cli): bump version to 0.6.5"

# Tag the release (use cli/ prefix)
git tag -a cli/v0.6.5 -m "Release CLI v0.6.5"
git push --follow-tags
```

---

## 🧪 Post-release Testing

After the GitHub Actions workflow completes:

### 1. Check GitHub Actions

Go to Actions tab and verify the workflow succeeded.

### 2. Check Releases

Go to Releases page and verify:
- Release is created with correct version
- All 4 executables are attached
- Checksums file is present

### 3. Test Downloads

Download and test executables on different platforms:

```bash
# Linux/macOS
chmod +x burger-api-linux
./burger-api-linux --version

# Windows
burger-api.exe --version
```

### 4. Verify Checksums

Verify downloaded files match checksums:

```bash
# Linux/macOS
sha256sum burger-api-linux
# Compare with checksums.txt from release

# Windows (PowerShell)
Get-FileHash burger-api.exe -Algorithm SHA256
# Compare with checksums.txt from release
```

---

## 🔧 Troubleshooting

### Issue: GitHub Actions workflow fails

**Symptoms:**
- Workflow shows red X
- Build step fails

**Solution:**
```bash
# Check workflow logs in GitHub Actions tab
# Common issues:
# - Bun version mismatch
# - Missing dependencies
# - Build script errors

# Test locally first
cd packages/cli
bun install
bun run build:linux  # Test one platform
```

### Issue: Executable doesn't work

**Symptoms:**
- Downloaded executable fails to run
- Permission denied errors

**Solution:**
```bash
# Linux/macOS: Make executable
chmod +x burger-api-linux

# Verify it's the right architecture
file burger-api-linux
# Should show: ELF 64-bit LSB executable, x86-64

# Check Bun version compatibility
bun --version
```

### Issue: Tag already exists

**Symptoms:**
```
error: tag 'cli/v0.6.5' already exists
```

**Solution:**
```bash
# Delete local tag
git tag -d cli/v0.6.5

# Delete remote tag
git push origin --delete cli/v0.6.5

# Create new tag
git tag -a cli/v0.6.5 -m "Release CLI v0.6.5"
git push origin cli/v0.6.5
```

### Issue: Version mismatch

**Symptoms:**
- Tag version doesn't match package.json version

**Solution:**
```bash
# Check current version
cat packages/cli/package.json | grep version

# Ensure tag matches (use cli/ prefix)
git tag -a cli/v0.6.5 -m "Release CLI v0.6.5"  # Use same version
```

---

## 📝 Quick Reference

### Build Commands

```bash
cd packages/cli
bun install                          # Install dependencies
bun run build:linux                  # Build for Linux
bun run build:win                    # Build for Windows
bun run build:mac                    # Build for macOS ARM64
bun run build:mac-intel              # Build for macOS Intel
bun run build:all                    # Build all platforms
```

### Release Commands

```bash
# Complete release workflow
cd packages/cli
npm version patch                    # Update version
# Edit CHANGELOG.md manually
git add CHANGELOG.md
git commit -m "chore(cli): update changelog"
git push origin main

# Create and push tag (using release script - recommended)
cd ../..                              # Go to repo root
./packages/cli/scripts/release/release-cli.sh

# Or manually:
# VERSION=$(node -p "require('./packages/cli/package.json').version")
# git tag -a "cli/v${VERSION}" -m "Release CLI v${VERSION}"
# git push origin "cli/v${VERSION}"       # Triggers GitHub Actions
```

### Verification Commands

```bash
# Check version
cat packages/cli/package.json | grep version

# List tags
git tag -l "v*"

# Check GitHub Actions status
# Visit: https://github.com/isfhan/burger-api/actions

# Check releases
# Visit: https://github.com/isfhan/burger-api/releases
```

---

## 🎯 Complete Workflow

Here's the complete workflow from development to release:

```bash
# 1. Make your code changes
# ... edit files ...

# 2. Test locally
cd packages/cli
bun install
bun run build:linux
./dist/burger-api-linux --version

# 3. Update version
npm version patch  # 0.6.4 -> 0.6.5

# 4. Update CHANGELOG.md
# Edit CHANGELOG.md with new version entry

# 5. Commit and push
git add packages/cli/CHANGELOG.md
git commit -m "chore(cli): update changelog for v0.6.5"
git push origin main

# 6. Create and push tag (using release script)
./packages/cli/scripts/release/release-cli.sh

# Or manually:
# VERSION=$(node -p "require('./packages/cli/package.json').version")
# git tag -a "cli/v${VERSION}" -m "Release CLI v${VERSION}"
# git push origin "cli/v${VERSION}"

# 7. Wait for GitHub Actions to complete
# Check: https://github.com/isfhan/burger-api/actions

# 8. Verify release
# Check: https://github.com/isfhan/burger-api/releases
```

---

## 📞 Support

- **Documentation:** https://burger-api.com
- **Issues:** https://github.com/isfhan/burger-api/issues
- **Releases:** https://github.com/isfhan/burger-api/releases

---

## 📄 License

MIT License - see [LICENSE](../burger-api/LICENSE) file for details.

---

**Last Updated:** December 2025  
**Current Version:** 0.6.5

