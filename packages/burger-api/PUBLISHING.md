# 📦 Publishing Guide for burger-api

This guide covers building, testing locally, and publishing `burger-api` to npm using Bun.

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Building the Package](#-building-the-package)
- [Testing Locally](#-testing-locally-without-publishing)
- [Pre-publish Checklist](#-pre-publish-checklist)
- [Publishing to npm](#-publishing-to-npm)
- [Version Management](#-version-management)
- [Post-publish Testing](#-post-publish-testing)
- [Troubleshooting](#-troubleshooting)

---

## ✅ Prerequisites

Before publishing, ensure you have:

- [Bun](https://bun.sh) installed (latest version)
- An [npm account](https://www.npmjs.com/signup)
- Git configured with your identity
- Write access to the `burger-api` npm package

```bash
# Verify Bun installation
bun --version

# Verify npm login
npm whoami
```

---

## 🔨 Building the Package

### Standard Build

```bash
# Install dependencies
bun install

# Build the package
bun run build

# This runs: tsc --project tsconfig.build.json
# Outputs: dist/src/**/*.js and dist/src/**/*.d.ts
```

### Verify Build Output

```bash
# Check dist folder structure
ls -la dist/src

# Should contain:
# - index.js & index.d.ts
# - core/ (server, openapi, ...)
# - types/ (index.d.ts)
# - utils/ (index, routing, error, response)
# - compiler/ (scanner, module-loader, conventions)
# - adapter/ (bun, web-standard)
```

### Clean Build

```bash
# Remove old build artifacts
rm -rf dist

# Rebuild from scratch
bun run build
```

---

## 🧪 Testing Locally (Without Publishing)

### Method 1: Using `npm pack` (Recommended)

This method creates a tarball exactly like npm publish would, giving you the most accurate test.

```bash
# In burger-api directory
bun run build
npm pack

# This creates: burger-api-1.0.0.tgz

# Create a test project
cd ..
mkdir burger-api-test
cd burger-api-test
bun init -y

# Install from the tarball
bun add ../burger-api/burger-api-1.0.0.tgz

# Verify installation
ls -la node_modules/burger-api
```

### Method 2: Using `bun link`

```bash
# In burger-api directory
bun link

# In your test project
cd ../burger-api-test
bun link burger-api

# Now burger-api is available globally
```

⚠️ **Note:** `bun link` may not always copy dependencies correctly. Use `npm pack` for more reliable testing.

### Create a Test Project

```bash
# In test project directory
mkdir -p api/products

# Create a test route
cat > api/products/route.ts << 'EOF'
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
 return Response.json({
  message: 'Products endpoint working!',
  query: ctx.validated.query,
  timestamp: new Date().toISOString(),
 });
}
EOF

# Per-method schema (query, params, headers, cookies, body)
cat > api/products/schema.ts << 'EOF'
import { z } from 'zod';

export const GET = {
 query: z.object({
  search: z.string().optional(),
 }),
};
EOF

# Create main server file
cat > index.ts << 'EOF'
import { Burger, setDir } from 'burger-api';

const burger = new Burger({
 title: 'Test API',
 description: 'Testing local burger-api build',
 apiDir: setDir(import.meta.dir, 'api'),
 debug: true,
});

burger.serve(4000, () => {
 console.log('🍔 Test server running!');
 console.log('📚 Docs: http://localhost:4000/docs');
 console.log('🔗 OpenAPI: http://localhost:4000/openapi.json');
 console.log('🧪 Test: http://localhost:4000/api/products');
});
EOF

# Run the test server
bun run index.ts
```

### Test the Endpoints

```bash
# Test API endpoint
curl http://localhost:4000/api/products

# Test with query parameters
curl "http://localhost:4000/api/products?search=test"

# Check OpenAPI spec
curl http://localhost:4000/openapi.json

# Visit Swagger UI in browser
# Open: http://localhost:4000/docs
```

### Verify TypeScript Types Work

The most important test - make sure IntelliSense and autocomplete work:

```typescript
// In your test project's index.ts
import { Burger } from 'burger-api';
import type { BurgerContext } from 'burger-api';

// Type should autocomplete when you type "ctx."
const handler = async (ctx: BurgerContext) => {
 ctx. // <-- Autocomplete should show: request, params, query, validated, etc.
 return new Response('ok');
};

// Burger options should show all available options
const options: BurgerOptions = {
 title: '', // <-- Autocomplete should work here
 // ... hovering over properties should show documentation
};
```

**✅ If autocomplete works correctly, your types are properly configured!**

---

## ✅ Pre-publish Checklist

Run through this checklist before every publish:

### 1. Version Check

```bash
# Check current version
cat package.json | grep '"version"'

# Update if needed (see Version Management section)
npm version patch # or minor/major
```

### 2. Update Documentation

```bash
# Update CHANGELOG.md with new version date and changes
# Update README.md version badge and latest changes
# Ensure all features are documented
```

### 3. Clean Build

```bash
# Remove old build
rm -rf dist

# Fresh build
bun run build

# Verify no errors
echo $? # Should output: 0
```

### 4. TypeScript Check

```bash
# Run type checking
bun run typecheck

# Should complete with no errors
```

### 5. Verify No Path Aliases in .d.ts Files

```bash
# This is CRITICAL - path aliases break types for users
grep -r "@burgerTypes\|@core\|@utils\|@src" dist/src --include="*.d.ts"

# Should output nothing (or "No matches found")
```

### 6. Check Package Contents

```bash
# See what files will be published
npm pack --dry-run

# Verify dist/ folder is included
# Verify examples/ is NOT included (unless you want it)
```

### 7. Verify Types File Exists

```bash
# Main types entry point
ls -la dist/src/types/index.d.ts

# Should show: -rw-r--r-- ... dist/src/types/index.d.ts
```

### 8. Test Imports in .d.ts Files

```bash
# Check main entry point uses relative imports
head -10 dist/src/index.d.ts

# Should see: import type { ... } from './types/index';
# NOT: import type { ... } from '@burgerTypes';
```

### 9. Check Package Metadata

```bash
# Verify package.json has correct fields
cat package.json | grep -E '"(name|version|module|types|files)"'

# Should output:
# "name": "burger-api",
# "version": "0.6.4",
# "module": "dist/src/index.js",
# "types": "dist/src/index.d.ts",
# "files": ["dist"]
```

### 10. Test with npm pack

```bash
# Create tarball and test it
npm pack
cd ../burger-api-test
bun add ../burger-api/burger-api-*.tgz
bun run index.ts # Should work perfectly
```

**✅ If all checks pass, you're ready to publish!**

---

## 🚀 Publishing to npm

### First Time Setup

If this is your first time publishing:

```bash
# Login to npm
npm login
# or
npm adduser

# Enter your credentials:
# - Username
# - Password
# - Email
# - Two-factor auth code (if enabled)

# Verify login
npm whoami
# Should output your npm username
```

### Publishing (CI via GitHub Actions)

Since 1.0.0, publishing runs through the `release-burger-api-npm.yml` GitHub
Actions workflow, triggered by a `burger-api/v*` tag. The workflow verifies the
package version matches the tag, builds, typechecks, runs tests, and publishes
to npm with the `NPM_TOKEN` secret.

```bash
# Bump the version (package.json) + update CHANGELOG.md, then:
git add package.json CHANGELOG.md
git commit -m "chore(burger-api): release 1.0.1"

# Tag the release — this triggers the publish workflow
git tag -a burger-api/v1.0.1 -m "Release 1.0.1"
git push origin burger-api/v1.0.1

# Or push all tags
git push --follow-tags
```

Manual publish (fallback, requires npm credentials):

```bash
# Make sure you're in the burger-api directory
cd /path/to/burger-api

# Final verification
bun run build
bun run typecheck

# Publish to npm registry
npm publish
```

### What Happens During Publish

1. npm reads `package.json` to get package info
2. npm packs files listed in `"files": ["dist"]`
3. npm uploads the tarball to the registry
4. Package becomes available at: `https://www.npmjs.com/package/burger-api`

---

## 🏷️ Version Management

### Semantic Versioning

burger-api follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (1.1.0): New features (backward compatible)
- **PATCH** (1.0.1): Bug fixes (backward compatible)

### Updating Version

```bash
# Patch version (1.0.0 -> 1.0.1)
# Use for: Bug fixes, documentation updates
npm version patch

# Minor version (1.0.0 -> 1.1.0)
# Use for: New features, non-breaking changes
npm version minor

# Major version (1.0.0 -> 2.0.0)
# Use for: Breaking changes, major overhauls
npm version major

# This automatically:
# 1. Updates package.json version
# 2. Creates a git commit
# 3. Creates a git tag (v1.0.1, v1.1.0, etc.)
```

### Manual Version Update

If you prefer to update manually:

```bash
# Edit package.json
# Change "version": "1.0.0" to "1.0.1"

# Update CHANGELOG.md
# Add new version entry with date

# Update README.md
# Update version badge

# Commit changes
git add .
git commit -m "chore: bump version to 1.0.1"

# Tag the release
git tag -a v1.0.1 -m "Release v1.0.1"
git push --follow-tags
```

### Pre-release Versions

For testing before official release:

```bash
# Create beta version (1.1.0-beta.0)
npm version prerelease --preid=beta

# Publish as beta
npm publish --tag beta

# Users can install with:
# bun add burger-api@beta
```

---

## 🧪 Post-publish Testing

After publishing, verify the package works for users:

### Test Fresh Installation

```bash
# Create a completely new project
mkdir burger-api-verify
cd burger-api-verify
bun init -y

# Install from npm (wait 2-3 minutes for npm to propagate)
bun add burger-api@latest

# Check version installed
cat node_modules/burger-api/package.json | grep version
```

### Test TypeScript Types

```bash
# Create test file
cat > test.ts << 'EOF'
import { Burger, setDir } from 'burger-api';
import type {
 BurgerContext,
 BurgerOptions
} from 'burger-api';

// Test 1: Types autocomplete
const options: BurgerOptions = {
 title: 'Test',
 apiDir: './api',
 // Typing here should show all available options with docs
};

// Test 2: Context type works
const handler = async (ctx: BurgerContext) => {
 // ctx. should show: request, params, query, validated, services, etc.
 console.log(ctx.request.url);
 return new Response('ok');
};

// Test 3: Generic types work
type MyValidated = {
 params: { id: string };
 query: { search: string };
};

const handler2 = async (ctx: BurgerContext<{ GET: { query: MyValidated['query'] } }>) => {
 // ctx.validated should be properly typed
 const id = ctx.validated?.query?.search;
 return Response.json({ id });
};

console.log('✅ All types work correctly!');
EOF

# Run type check
bun run test.ts
```

### Test Runtime

```bash
# Create minimal API
mkdir -p api
cat > api/route.ts << 'EOF'
import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
 return Response.json({ 
 message: 'Published version works!',
 version: '1.0.0'
 });
}
EOF

cat > index.ts << 'EOF'
import { Burger, setDir } from 'burger-api';

const burger = new Burger({
 apiDir: setDir(import.meta.dir, 'api'),
});

burger.serve(4000);
EOF

# Run it
bun run index.ts

# Test
curl http://localhost:4000/api
```

**✅ If everything works, your publish was successful!**

---

## 🔧 Troubleshooting

### Issue: Types not working after installation

**Symptoms:**
- No autocomplete in TypeScript
- Errors like "Cannot find module '@burgerTypes'"

**Solution:**
```bash
# Check if types file exists in published package
npm view burger-api dist.tarball

# Download and inspect
npm pack burger-api
tar -xzf burger-api-*.tgz
cat package/dist/src/index.d.ts

# Look for path aliases like @burgerTypes - there should be NONE
# All imports should use relative paths: './types/index'
```

**Fix if needed:**
```bash
# In burger-api source
# Verify no path aliases in tsconfig.json
cat tsconfig.json | grep paths

# Should show no "paths" configuration

# Rebuild and republish
rm -rf dist
bun run build
npm version patch
npm publish
```

### Issue: "Cannot find module" errors

**Symptoms:**
```
Error: Cannot find module 'burger-api'
```

**Solution:**
```bash
# Check package.json exports
cat package.json | grep -A2 '"module"'

# Should show:
# "module": "dist/src/index.js",
# "types": "dist/src/index.d.ts",

# Verify files are in published package
npm pack
tar -tzf burger-api-*.tgz | grep "dist/src/index"
```

### Issue: Old version still showing after publish

**Symptoms:**
- `bun add burger-api@latest` installs old version

**Solution:**
```bash
# Wait 2-3 minutes for npm registry to propagate

# Force clear cache
bun pm cache rm
npm cache clean --force

# Check npm registry
npm view burger-api version

# If still old, check what you published
npm view burger-api
```

### Issue: Build fails with TypeScript errors

**Symptoms:**
```
error TS2344: Type 'unknown' does not satisfy constraint...
```

**Solution:**
```bash
# Check TypeScript version
bun --version
npm view typescript version

# Update if needed
bun add -D typescript@latest

# Clean and rebuild
rm -rf dist node_modules
bun install
bun run build
```

### Issue: Examples have import errors

**Symptoms:**
- Examples can't import from 'burger-api' in development

**Solution:**
```bash
# Examples use relative imports in source
# They use: import { Burger } from '../../src/index';

# This is correct for development
# After publishing, users use: import { Burger } from 'burger-api';
```

### Issue: Package size too large

**Symptoms:**
```
npm notice 📦 burger-api@1.0.0
npm notice === Tarball Contents ===
npm notice 2.0MB dist/
```

**Solution:**
```bash
# Check what's being included
npm pack --dry-run

# Make sure .npmignore excludes:
cat .npmignore

# Should contain:
# src/
# examples/
# tests/
# *.test.ts
# node_modules/
```

---

## 📝 Quick Reference

### Build Commands

```bash
bun install # Install dependencies
bun run build # Build package
bun run typecheck # Check types
```

### Testing Commands

```bash
npm pack # Create tarball
bun add ./burger-api-1.0.0.tgz # Install tarball
bun link # Create global link
```

### Publishing Commands

```bash
npm login # Login to npm
npm whoami # Check login
npm version patch # Bump version
npm publish # Publish package
git push --follow-tags # Push to git
```

### Verification Commands

```bash
# Check for path aliases (should return nothing)
grep -r "@" dist/src --include="*.d.ts"

# Check package contents
npm pack --dry-run

# Check published version
npm view burger-api version

# Check types file
ls -la dist/src/types/index.d.ts
```

---

## 🎯 Complete Workflow

Here's the complete workflow from development to publish:

```bash
# 1. Make changes to code
# ... edit files ...

# 2. Update version
npm version minor # or patch/major

# 3. Update documentation
# Edit CHANGELOG.md and README.md

# 4. Commit changes
git add .
git commit -m "feat: add new feature"

# 5. Build
bun run build

# 6. Verify
bun run typecheck
grep -r "@" dist/src --include="*.d.ts"

# 7. Test locally
npm pack
cd ../test-project
bun add ../burger-api/burger-api-*.tgz
# ... test thoroughly ...

# 8. Publish
cd ../burger-api
npm publish

# 9. Push to git
git push --follow-tags

# 10. Verify on npm
npm view burger-api version

# 11. Test published version
cd ../verify-project
bun add burger-api@latest
# ... final verification ...
```

---

## 📞 Support

- **Documentation:** https://burger-api.com
- **Issues:** https://github.com/isfhan/burger-api/issues
- **npm Package:** https://www.npmjs.com/package/burger-api

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Last Updated:** August 2, 2026 
**Package Version:** 1.0.0

