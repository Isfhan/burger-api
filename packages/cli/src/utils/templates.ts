/** Scaffolding templates and generated files for `burger-api create` and `generate`. */

import { join, resolve, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';

import type { CreateOptions } from '../types/index';
import { spinner } from './logger';
import { installSkill } from './skills';
import { reindent, isReindentable } from './reindent';

/** Walks up from `startFile` to the nearest `package.json` and returns its dir. */
function findPackageRoot(startFile: string): string | undefined {
    let dir = dirname(startFile);
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, 'package.json'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
    return undefined;
}

/**
 * Resolve the exact `zod` version the CLI's own `burger-api` dependency
 * uses, so the scaffold pins it. Two zod copies (even adjacent patches) are
 * distinct types to TypeScript and can blow up with `TS2589`, so pinning to
 * the version burger-api itself resolves avoids that class of bug.
 */
function resolveMatchingZodVersion(): string {
    const FALLBACK = '^4.5.4';
    try {
        const burgerApiEntry = Bun.resolveSync('burger-api', import.meta.dir);
        const burgerApiRoot = findPackageRoot(burgerApiEntry);
        if (!burgerApiRoot) return FALLBACK;

        const zodEntry = Bun.resolveSync('zod', burgerApiRoot);
        const zodRoot = findPackageRoot(zodEntry);
        if (!zodRoot) return FALLBACK;

        const zodPkg = JSON.parse(
            readFileSync(join(zodRoot, 'package.json'), 'utf-8')
        ) as { version?: string };
        return zodPkg.version ?? FALLBACK;
    } catch {
        return FALLBACK;
    }
}

/**
 * Local burger-api override from BURGER_API_SOURCE (pre-release testing):
 * unset → null (npm range), "link" → the global bun link store, a path →
 * "file:<absolute path>" from a local checkout.
 */
export function burgerApiSourceOverride(): {
    specifier: string;
    label: string;
} | null {
    const value = process.env.BURGER_API_SOURCE?.trim();
    if (!value) return null;
    if (value.toLowerCase() === 'link') {
        return {
            specifier: 'link:burger-api',
            label: 'link:burger-api (BURGER_API_SOURCE=link)',
        };
    }
    const abs = resolve(value);
    return {
        specifier: `file:${abs}`,
        label: `${abs} (BURGER_API_SOURCE)`,
    };
}

/** The running CLI's own version (package.json next to src/). */
function cliVersion(): string | undefined {
    try {
        const pkg = JSON.parse(
            readFileSync(join(import.meta.dir, '..', '..', 'package.json'), 'utf-8')
        ) as { version?: string };
        return pkg.version;
    } catch {
        return undefined;
    }
}

/**
 * `@burger-api/cli` specifier for scaffolded devDependencies, following
 * BURGER_API_SOURCE like `burger-api` does; otherwise `^<this CLI's version>`.
 */
function cliSpecifier(): string {
    const override = burgerApiSourceOverride();
    if (override?.specifier === 'link:burger-api') return 'link:@burger-api/cli';
    if (override?.specifier.startsWith('file:')) {
        const sibling = resolve(override.specifier.slice(5), '..', 'cli');
        if (existsSync(join(sibling, 'package.json'))) return `file:${sibling}`;
    }
    return `^${cliVersion() ?? '1.0.0-beta'}`;
}

/**
 * package.json for a new project: burger-api dependency, scripts, dev deps.
 *
 * @param projectName - Name of the project
 * @returns package.json content as a string
 */
export function generatePackageJson(
    projectName: string,
    lang: 'ts' | 'js' = 'ts'
): string {
    const entry = lang === 'js' ? 'src/index.js' : 'src/index.ts';
    // `^1.0.0-beta` so scaffolds resolve prereleases at all (`^1.0.0` would
    // exclude them) and pick up later betas and stable 1.x.
    const burgerApiSpecifier =
        burgerApiSourceOverride()?.specifier ?? '^1.0.0-beta';
    const packageJson = {
        // npm package names must be lowercase.
        name: projectName.toLowerCase(),
        version: '0.1.0',
        type: 'module',
        // dev/start/build auto-detect src/index.ts|js|mjs, so TS and JS
        // scaffolds share scripts; `start` runs the production bundle.
        scripts: {
            dev: 'burger-api dev',
            start: 'burger-api start',
            build: `burger-api build ${entry}`,
            // JS projects check with jsconfig.json; plain `tsc` prints help.
            typecheck:
                lang === 'js'
                    ? 'tsc -p jsconfig.json --noEmit'
                    : 'tsc --noEmit',
        },
        dependencies: {
            'burger-api': burgerApiSpecifier,
            zod: resolveMatchingZodVersion(),
        },
        // Scripts call `burger-api`, so the CLI ships with the project
        // (CI/Docker have no global CLI).
        devDependencies: {
            '@burger-api/cli': cliSpecifier(),
            '@types/bun': 'latest',
            typescript: '^5',
        },
    };

    // A local CLI checkout still asks for `burger-api@^1.0.0-beta` from npm;
    // point that at the same local copy so an unpublished version resolves.
    if (burgerApiSpecifier.startsWith('file:')) {
        return JSON.stringify(
            { ...packageJson, overrides: { 'burger-api': burgerApiSpecifier } },
            null,
            2
        );
    }

    return JSON.stringify(packageJson, null, 2);
}

/** tsconfig.json content for a new TypeScript project. */
export function generateTsConfig(): string {
    const tsconfig = {
        compilerOptions: {
            lib: ['ESNext'],
            target: 'ESNext',
            module: 'ESNext',
            moduleDetection: 'force',
            jsx: 'react-jsx',
            allowJs: true,

            // Best practices for type safety
            strict: true,
            noUncheckedIndexedAccess: true,
            noImplicitOverride: true,

            // Module resolution for Bun
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            verbatimModuleSyntax: true,
            noEmit: true,

            // Interop
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,

            // Skip type checking for dependencies
            skipLibCheck: true,

            // Types
            types: ['bun'],
        },
    };

    return JSON.stringify(tsconfig, null, 2);
}

/** jsconfig.json for `--lang js`: editor type-checking of JSDoc (checkJs). */
export function generateJsConfig(): string {
    const jsconfig = {
        compilerOptions: {
            lib: ['ESNext'],
            target: 'ESNext',
            module: 'ESNext',
            moduleDetection: 'force',
            jsx: 'react-jsx',
            checkJs: true,

            // Best practices for JSDoc type safety
            strict: true,
            noImplicitAny: true,
            noUncheckedIndexedAccess: true,

            // Module resolution for Bun
            moduleResolution: 'bundler',
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            skipLibCheck: true,
            noEmit: true,
        },
        include: ['src'],
    };

    return JSON.stringify(jsconfig, null, 2);
}

/** .gitignore content for a new project. */
export function generateGitIgnore(): string {
    return `# Bun
node_modules/
bun.lockb
.env*

# Build output
dist/
.build/
*.exe

# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
*.swo
`;
}

/** .prettierrc content matching the BurgerAPI style. */
export function generatePrettierConfig(): string {
    const prettierConfig = {
        semi: true,
        singleQuote: true,
        tabWidth: 4,
        trailingComma: 'es5',
        printWidth: 80,
        arrowParens: 'always',
    };

    return JSON.stringify(prettierConfig, null, 2);
}

/** Single-quoted JS string literal (scaffolds follow the shipped .prettierrc). */
function sq(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Scan dirs and prefixes written identically into src/index.* and
 * burger.build.*, so dev/start and build never disagree; disabled
 * features are omitted.
 */
export function scaffoldScanOptions(
    options: CreateOptions
): [key: string, value: string, comment: string][] {
    const entries: [string, string, string][] = [];
    if (options.useApi) {
        entries.push([
            'apiDir',
            `./src/${options.apiDir || 'api'}`,
            'folder with API route files',
        ]);
        entries.push([
            'apiPrefix',
            options.apiPrefix || '/api',
            'URL prefix for API routes',
        ]);
    }
    if (options.usePages) {
        entries.push([
            'pageDir',
            `./src/${options.pageDir || 'pages'}`,
            'folder with HTML pages',
        ]);
        entries.push([
            'pagePrefix',
            options.pagePrefix || '/',
            'URL prefix for pages',
        ]);
    }
    if (options.useWs) {
        entries.push([
            'wsDir',
            `./src/${options.wsDir || 'websocket'}`,
            'folder with WebSocket route files',
        ]);
    }
    return entries;
}

/** src/index.ts|js: scan options plus app.serve(). */
export function generateIndexFile(options: CreateOptions): string {
    const lines: string[] = [];

    lines.push("import { Burger } from 'burger-api';");
    lines.push('');

    // Keep scan options in sync with burger.build.
    lines.push('// Keep dirs/prefixes in sync with burger.build (used by the build).');
    lines.push('const app = new Burger({');

    for (const [key, value] of scaffoldScanOptions(options)) {
        lines.push(` ${key}: ${sq(value)},`);
    }

    if (options.debug) {
        lines.push(' debug: true,');
    }

    lines.push('});');
    lines.push('');

    // PORT lets `burger-api start --port` / hosting platforms override it.
    lines.push('const port = Number(process.env.PORT) || 4000;');
    lines.push('app.serve(port, () => {');
    lines.push(' console.log(`Server running on http://localhost:${port}`);');
    lines.push('});');
    lines.push('');

    return lines.join('\n');
}

/**
 * burger.build.ts from the create answers.
 *
 * @param options - Project configuration from user prompts
 * @returns burger.build.ts content as a string
 */
export function generateBurgerConfig(options: CreateOptions): string {
    const debug = Boolean(options.debug);

    const body = [
        ...scaffoldScanOptions(options).map(
            ([key, value, comment]) =>
                ` ${key}: ${sq(value)}, // ${comment}`
        ),
        ` debug: ${debug}, // extra logging when true`,
    ].join('\n');

    const header = [
        '/**',
        ' * BurgerAPI build config — read by the CLI only (build, inspect, doctor,',
        ' * generate); not loaded at runtime. dev/start use the options in',
        ' * src/index — keep dirs and prefixes identical in both files',
        ' * (burger-api doctor warns when they differ).',
        ' */',
    ];

    // Only enabled features are written; the CLI fills the rest from
    // CONVENTION_DEFAULTS, so every key is optional.
    if (options.lang === 'js') {
        return [
            ...header,
            "/** @type {Partial<import('burger-api').BuildConfig>} */",
            'export default {',
            body,
            '};',
            '',
        ].join('\n');
    }
    return [
        ...header,
        "import type { BuildConfig } from 'burger-api';",
        '',
        'export default {',
        body,
        '} satisfies Partial<BuildConfig>;',
        '',
    ].join('\n');
}

/** The sample landing page stylesheet. */
export function generateSampleCss(): string {
    return `
 :root {
 --color-primary: hsl(30, 75%, 90%);
 --color-primary-dark: hsl(30, 75%, 80%);
 --color-bg: #09090b;
 --color-surface: hsl(240, 10%, 3.9%);
 --color-border: hsl(240, 3.7%, 15.9%);
 --color-success: hsl(120, 50%, 40%);
 --color-text-muted: hsl(240, 5%, 50%);
 }

 * {
 margin: 0;
 padding: 0;
 box-sizing: border-box;
 }

 body {
 font-family: 'Poppins', system-ui, sans-serif;
 min-height: 100vh;
 background: var(--color-bg);
 color: #fff;
 display: flex;
 flex-direction: column;
 align-items: center;
 padding: 60px 20px 40px;
 }

 .hero {
 text-align: center;
 max-width: 600px;
 margin-bottom: 48px;
 }

 .logo-wrapper {
 display: flex;
 flex-wrap: wrap;
 margin-bottom: 32px;
 }

 .logo {
 width: 80px;
 height: 80px;
 }

 .logo-text {
 font-size: 3.5rem;
 font-weight: 600;
 color: var(--color-primary);
 }

 h1 {
 font-size: 2.5rem;
 font-weight: 600;
 margin-bottom: 12px;
 color: #fff;
 }

 .subtitle {
 color: var(--color-text-muted);
 font-size: 1.1rem;
 margin-bottom: 24px;
 }

 .status {
 display: inline-flex;
 align-items: center;
 gap: 8px;
 background: hsla(120, 50%, 40%, 0.1);
 border: 1px solid hsla(120, 50%, 40%, 0.3);
 padding: 8px 16px;
 border-radius: 20px;
 font-size: 0.875rem;
 color: var(--color-success);
 }

 .status::before {
 content: '';
 width: 8px;
 height: 8px;
 background: var(--color-success);
 border-radius: 50%;
 animation: pulse 2s infinite;
 }

 @keyframes pulse {
 0%, 100% { opacity: 1; }
 50% { opacity: 0.5; }
 }

 /* Edit hint section */
 .edit-hint {
 background: var(--color-surface);
 border: 1px solid var(--color-border);
 border-radius: 12px;
 padding: 24px 32px;
 margin-bottom: 48px;
 max-width: 500px;
 text-align: center;
 }

 .edit-hint p {
 color: var(--color-text-muted);
 font-size: 0.95rem;
 margin-bottom: 8px;
 }

 .edit-hint code {
 color: var(--color-primary);
 font-family: 'JetBrains Mono', monospace;
 font-size: 0.9rem;
 }

 .edit-hint .hint {
 font-size: 0.8rem;
 color: hsl(240, 5%, 40%);
 margin-top: 12px;
 }

 /* Quick start section */
 .quick-start {
 max-width: 500px;
 width: 100%;
 margin-bottom: 48px;
 }

 .quick-start h2 {
 font-size: 1rem;
 font-weight: 500;
 color: var(--color-text-muted);
 margin-bottom: 16px;
 text-align: center;
 }

 .commands {
 display: flex;
 flex-direction: column;
 gap: 8px;
 }

 .command {
 display: flex;
 align-items: center;
 background: var(--color-surface);
 border: 1px solid var(--color-border);
 border-radius: 8px;
 padding: 12px 16px;
 font-family: 'JetBrains Mono', monospace;
 font-size: 0.85rem;
 transition: border-color 0.2s;
 }

 .command:hover {
 border-color: var(--color-primary-dark);
 }

 .command .prefix {
 color: var(--color-success);
 margin-right: 8px;
 }

 .command .cmd {
 color: var(--color-primary);
 }

 .command .comment {
 color: var(--color-text-muted);
 margin-left: auto;
 font-size: 0.75rem;
 }

 /* Links section */
 .links {
 display: flex;
 gap: 12px;
 justify-content: center;
 flex-wrap: wrap;
 margin-bottom: 48px;
 }

 .link {
 color: var(--color-text-muted);
 text-decoration: none;
 font-size: 0.9rem;
 padding: 10px 20px;
 border: 1px solid var(--color-border);
 border-radius: 8px;
 transition: all 0.2s;
 }

 .link:hover {
 color: var(--color-primary);
 border-color: var(--color-primary-dark);
 background: var(--color-surface);
 }

 .link.primary {
 background: var(--color-primary);
 border-color: var(--color-primary);
 color: #000;
 }

 .link.primary:hover {
 background: var(--color-primary-dark);
 border-color: var(--color-primary-dark);
 }

 /* Documentation links */
 .docs-links {
 display: flex;
 gap: 32px;
 justify-content: center;
 flex-wrap: wrap;
 margin-bottom: 48px;
 padding-top: 32px;
 border-top: 1px solid var(--color-border);
 max-width: 600px;
 width: 100%;
 }

 .docs-section h3 {
 font-size: 0.8rem;
 font-weight: 500;
 color: var(--color-text-muted);
 margin-bottom: 12px;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .docs-section a {
 display: block;
 color: hsl(240, 5%, 60%);
 text-decoration: none;
 font-size: 0.85rem;
 padding: 4px 0;
 transition: color 0.2s;
 }

 .docs-section a:hover {
 color: var(--color-primary);
 }

 /* Footer */
 .footer {
 margin-top: auto;
 text-align: center;
 padding-top: 32px;
 }

 .version {
 font-size: 0.75rem;
 color: hsl(240, 5%, 35%);
 margin-bottom: 16px;
 }

 .social-links {
 display: flex;
 gap: 16px;
 justify-content: center;
 margin-bottom: 16px;
 }

 .social-links a {
 color: var(--color-text-muted);
 text-decoration: none;
 font-size: 0.85rem;
 transition: color 0.2s;
 }

 .social-links a:hover {
 color: var(--color-primary);
 }

 .powered-by {
 color: hsl(240, 5%, 35%);
 font-size: 0.8rem;
 }

 .powered-by a {
 color: var(--color-primary-dark);
 text-decoration: none;
 }

 .powered-by a:hover {
 color: var(--color-primary);
 }

 @media (max-width: 600px) {
 h1 { font-size: 2rem; }
 .docs-links { flex-direction: column; gap: 24px; text-align: center; }
 .command .comment { display: none; }
 }
 `;
}

/** The sample page script (app.js). */
export function generateSampleJs(): string {
    return 'console.log("Hello from app.js");';
}

/** Escape text for safe use inside HTML text nodes and double-quoted attributes. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Absolute path from site root for href (leading slash, no trailing slash except root). */
function hrefFromApiPrefix(apiPrefix: string | undefined): string {
    const raw = (apiPrefix ?? '/api').trim() || '/api';
    let path = raw.startsWith('/') ? raw : `/${raw}`;
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }
    return path;
}

/**
 * The scaffolded landing page (index.html), using the BurgerAPI colors.
 *
 * @param options - Project configuration (name, dirs, apiPrefix, useApi)
 * @returns index.html content as a string
 */
export function generateIndexPage(options: CreateOptions): string {
    const projectName = options.name;
    const pageDir = options.pageDir || 'pages';
    const apiDir = options.apiDir || 'api';
    const apiTryHref = escapeHtml(hrefFromApiPrefix(options.apiPrefix));
    // Root-absolute asset URLs: relative ./assets/... breaks under a custom
    // pagePrefix when the page is served at `/prefix` (no trailing slash).
    const trimmedPagePrefix = (options.pagePrefix ?? '/').replace(
        /^\/+|\/+$/g,
        ''
    );
    const assetBase = escapeHtml(
        trimmedPagePrefix ? `/${trimmedPagePrefix}/assets` : '/assets'
    );
    const ext = options.lang === 'js' ? 'js' : 'ts';

    const pageHintPath = escapeHtml(`src/${pageDir}/index.html`);
    const apiHintPath = escapeHtml(`src/${apiDir}/route.${ext}`);

    const editHintParagraphs = options.useApi
        ? `<p>Edit <code>${pageHintPath}</code> and save to reload the page.</p>
 <p>Edit <code>${apiHintPath}</code> and save to reload the API endpoint.</p>`
        : `<p>Edit <code>${pageHintPath}</code> and save to reload the page.</p>`;

    // API docs exist only when the app has API routes.
    const actionLinks = options.useApi
        ? `<a href="/docs" class="link primary">API Docs</a>
 <a href="${apiTryHref}" class="link">Try API</a>
 <a href="/openapi.json" class="link">OpenAPI</a>`
        : `<a href="https://burger-api.com/docs" class="link primary" target="_blank">Documentation</a>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>${escapeHtml(projectName)}</title>
 <link rel="icon" type="image/png" href="https://burger-api.com/img/logo.png">
 <link rel="preconnect" href="https://fonts.googleapis.com">
 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
 <!-- Assets: Styles -->
 <link rel="stylesheet" href="${assetBase}/css/style.css" />
 <!-- Assets: Scripts -->
 <script src="${assetBase}/js/app.js" type="module"></script>
</head>
<body>
 <!-- Hero Section -->
 <section class="hero">
 <div class="logo-wrapper">
 <img src="https://burger-api.com/img/logo.png" alt="BurgerAPI Logo" class="logo">
 <span class="logo-text">BurgerAPI</span>
 </div>
 <p class="subtitle">Your Project ${escapeHtml(projectName)} is ready</p>
 <div class="status">Server running</div>
 </section>

 <!-- Edit Hint -->
 <div class="edit-hint">
 ${editHintParagraphs}
 <p class="hint">Your changes will automatically refresh the server.</p>
 </div>

 <!-- Quick Start Commands -->
 <section class="quick-start">
 <h2>Quick Start</h2>
 <div class="commands">
 <div class="command">
 <span class="prefix">$</span>
 <span class="cmd">burger-api add cors logger</span>
 <span class="comment"># Add hooks</span>
 </div>
 <div class="command">
 <span class="prefix">$</span>
 <span class="cmd">bun run build</span>
 <span class="comment"># Build for production</span>
 </div>
 </div>
 </section>

 <!-- Action Links -->
 <div class="links">
 ${actionLinks}
 </div>

 <!-- Documentation Links -->
 <div class="docs-links">
 <div class="docs-section">
 <h3>Documentation</h3>
 <a href="https://burger-api.com/docs" target="_blank">Getting Started</a>
 <a href="https://burger-api.com/docs/core/configuration" target="_blank">Configuration</a>
 <a href="https://burger-api.com/docs/core/request-handling" target="_blank">Request Handling</a>
 </div>
 <div class="docs-section">
 <h3>Resources</h3>
 <a href="https://github.com/isfhan/burger-api" target="_blank">GitHub</a>
 <a href="https://github.com/isfhan/burger-api/issues" target="_blank">Report Issue</a>
 <a href="https://www.npmjs.com/package/burger-api" target="_blank">NPM Package</a>
 </div>
 <div class="docs-section">
 <h3>Community</h3>
 <a href="https://github.com/isfhan/burger-api" target="_blank">Contribute</a>
 <a href="https://github.com/isfhan/burger-api/discussions" target="_blank">Discussions</a>
 <a href="https://github.com/isfhan/burger-api/stargazers" target="_blank">Star on GitHub</a>
 </div>
 </div>

 <!-- Footer -->
 <footer class="footer">
 <div class="version">BurgerAPI v1.0.0-beta • Bun v1.3+</div>
 <div class="social-links">
 <a href="https://github.com/isfhan/burger-api" target="_blank">GitHub</a>
 <a href="https://www.npmjs.com/package/burger-api" target="_blank">NPM</a>
 <a href="https://burger-api.com" target="_blank">Website</a>
 </div>
 <p class="powered-by">
 Built with ❤️ using <a href="https://burger-api.com">BurgerAPI</a>
 </p>
 </footer>
</body>
</html>
`;
}

/** hooks.ts|js — global lifecycle hook registrations. */
export function generateHooksFile(lang: 'ts' | 'js' = 'ts'): string {
    if (lang === 'js') {
        return `/**
 * Global lifecycle hooks — apply to every request.
 * Hook points: onRequest, transform, beforeRoute, afterRoute, mapResponse, onError
 */

/** @type {import('burger-api').GlobalHooks['beforeRoute']} */
export const beforeRoute = [];
`;
    }
    return `/**
 * Global lifecycle hooks — apply to every request.
 * Hook points: onRequest, transform, beforeRoute, afterRoute, mapResponse, onError
 */

import type { GlobalHooks } from 'burger-api';

export const beforeRoute: GlobalHooks['beforeRoute'] = [];
`;
}

export function generatePluginsFile(lang: 'ts' | 'js' = 'ts'): string {
    if (lang === 'js') {
        return `// Register plugins here — apply to every request.
// burger.usePlugin(myPlugin);

/** @param {import('burger-api').PluginRegistrar} burger */
export default (burger) => {
 // burger.usePlugin(myPlugin);
};
`;
    }
    return `import type { PluginRegistrar } from 'burger-api';

export default (burger: PluginRegistrar) => {
 // burger.usePlugin(myPlugin);
};
`;
}

export function generateProvidersFile(lang: 'ts' | 'js' = 'ts'): string {
    if (lang === 'js') {
        return `// Register services here — injected into ctx.services.
// burger.provide('db', myDatabase);

/** @param {import('burger-api').ProviderRegistrar} burger */
export default (burger) => {
 // burger.provide('db', myDatabase);
};
`;
    }
    return `import type { ProviderRegistrar } from 'burger-api';

export default (burger: ProviderRegistrar) => {
 // burger.provide('db', myDatabase);
};
`;
}


/**
 * openapi.config.ts|js: OpenAPI metadata, docs UI, docs auth.
 *
 * @param options - Project configuration from user prompts
 * @returns openapi.config.ts content as a string
 */
export function generateOpenAPIConfig(options: CreateOptions): string {
    const lines: string[] = [];

    if (options.lang !== 'js') {
        lines.push("import type { OpenAPIConfig } from 'burger-api';");
        lines.push('');
    }
    lines.push('export default {');
    lines.push(` title: ${JSON.stringify(options.name || 'Burger API')},`);
    lines.push(
        ` description: ${JSON.stringify(
            `${options.name || 'Burger API'} documentation`
        )},`
    );
    lines.push(` version: '1.0.0',`);
    lines.push('');
    // No `servers` by default: docs call the same origin they are served from.
    lines.push(' // Uncomment to list explicit servers (default: same origin as the docs):');
    lines.push(
        ' // servers: [{ url: "https://api.example.com", description: "Production" }],'
    );
    lines.push('');
    lines.push(' // Uncomment to protect docs with basic auth:');
    lines.push(' // docsAuth: { username: "admin", password: "changeme" },');
    lines.push('');
    lines.push(' // Uncomment to use Scalar instead of Swagger UI:');
    lines.push(" // import { scalarDocs } from 'burger-api';");
    lines.push(' // provider: scalarDocs(),');
    lines.push('');
    lines.push(
        ' // Uncomment to add JSON Schema conversion for custom validation libraries:'
    );
    lines.push(
        ' // mapJsonSchema: { date: (schema) => ({ type: "string", format: "date-time" }) },'
    );
    if (options.lang === 'js') {
        lines.push('};');
    } else {
        lines.push('} satisfies OpenAPIConfig;');
    }
    lines.push('');

    return lines.join('\n');
}

/**
 * AGENTS.md for a new project: commands, layout, and framework rules that
 * AI agents need. Content follows the create options, so it never points at
 * files that were not scaffolded.
 *
 * @param options - Project configuration from user prompts
 * @param skillsInstalled - Whether the burger-api skill was downloaded
 * @returns AGENTS.md content as a string
 */
export function generateAgentsMd(
    options: CreateOptions,
    skillsInstalled = false
): string {
    const ext = options.lang === 'js' ? 'js' : 'ts';
    const apiDir = options.apiDir || 'api';
    const apiPrefix = options.apiPrefix || '/api';
    const pageDir = options.pageDir || 'pages';
    const pagePrefix = options.pagePrefix || '/';
    const wsDir = options.wsDir || 'websocket';
    const lines: string[] = [];

    lines.push('# AGENTS.md');
    lines.push('');
    lines.push(
        'This is a burger-api project (Bun-first API framework, file-based routing).'
    );
    lines.push('');

    lines.push('## Commands');
    lines.push('');
    lines.push('- `bun run dev` - start the dev server with hot reload');
    lines.push('- `bun run build` - bundle the project for production');
    lines.push('- `bun run start` - run the production bundle');
    lines.push('- `burger-api doctor` - check the project for problems');
    lines.push(
        '- `burger-api inspect --json` - list discovered routes, hooks, and plugins'
    );
    lines.push(
        '- `burger-api generate route <path>` - scaffold a route directory'
    );
    lines.push('- `burger-api add <name>` - add an ecosystem hook or plugin');
    lines.push('');

    lines.push('## Project layout');
    lines.push('');
    lines.push(
        `- \`src/index.${ext}\` - app entry: \`new Burger(...)\` and \`app.serve()\``
    );
    lines.push(`- \`src/hooks.${ext}\` - global lifecycle hooks`);
    lines.push(
        `- \`src/plugins.${ext}\` - plugins, registered with \`burger.usePlugin()\``
    );
    lines.push(
        `- \`src/providers.${ext}\` - services, registered with \`burger.provide()\``
    );
    lines.push(`- \`src/openapi.config.${ext}\` - OpenAPI metadata and docs UI`);
    if (options.useApi) {
        lines.push(
            `- \`src/${apiDir}/\` - API routes, served under \`${apiPrefix}\``
        );
    }
    if (options.usePages) {
        lines.push(
            `- \`src/${pageDir}/\` - HTML pages, served under \`${pagePrefix}\``
        );
    }
    if (options.useWs) {
        lines.push(`- \`src/${wsDir}/\` - file-based WebSocket routes`);
    }
    lines.push(
        `- \`burger.build.${ext}\` - build-time config (dirs, prefixes); keep it in sync with \`src/index.${ext}\``
    );
    lines.push('');

    lines.push('## Route convention files');
    lines.push('');
    lines.push(
        options.useApi
            ? `Each route is a folder under \`src/${apiDir}/\` with separate convention files:`
            : 'API routes are folders with separate convention files:'
    );
    lines.push('');
    lines.push('| File | Purpose |');
    lines.push('| --- | --- |');
    lines.push(
        ext === 'js'
            ? '| `route.js` | Handlers: `export async function GET(ctx)` |'
            : '| `route.ts` | Handlers: `export async function GET(ctx: BurgerContext)` |'
    );
    lines.push(
        `| \`schema.${ext}\` | Per-method validation: \`export const GET = { query: ... }\` |`
    );
    lines.push(`| \`hooks.${ext}\` | Hooks for this route only |`);
    lines.push(`| \`openapi.${ext}\` | Per-method OpenAPI metadata |`);
    lines.push(`| \`config.${ext}\` | Route options: auth, cache, timeout |`);
    lines.push('');
    lines.push(
        'Use per-method named exports (`GET`, `POST`, ...) in route, schema, and openapi files.'
    );
    lines.push('');

    lines.push('## Rules');
    lines.push('');
    if (ext === 'js') {
        lines.push(
            "- Handlers take `ctx` and return a Web `Response`; type it with JSDoc: `@param {import('burger-api').BurgerContext} ctx`."
        );
    } else {
        lines.push(
            '- Handlers take `ctx: BurgerContext` and return a Web `Response`.'
        );
    }
    lines.push(
        `- Use \`defineRoute(GetSchema, (ctx) => ...)\` with a \`schema.${ext}\` to type \`ctx.validated\`.`
    );
    lines.push(
        '- The request lifecycle is hooks: `onRequest`, `transform`, `beforeRoute`, `afterRoute`, `mapResponse`, `onError`.'
    );
    lines.push(
        `- Extensions are plugins, registered in \`src/plugins.${ext}\` with \`burger.usePlugin()\`.`
    );
    lines.push(
        '- Do not use middleware or the `BurgerRequest` type; both were removed.'
    );
    lines.push(
        '- Do not export lowercase handler names (`get`); use `GET`, `POST`, and so on.'
    );
    lines.push(
        '- Route folders are self-contained: convention files are never inherited from parent folders, and `(group)` folders only change the URL. Put shared code in a normal module and import it.'
    );
    lines.push(
        '- `ctx.services` is read-only; put per-request data in a `transform` hook.'
    );
    lines.push('');

    lines.push('## After changes');
    lines.push('');
    lines.push('Run `burger-api doctor`.');
    lines.push('');

    lines.push('## Learn more');
    lines.push('');
    if (skillsInstalled) {
        lines.push(
            '- Skill: `.agents/skills/burger-api/` and `.claude/skills/burger-api/`'
        );
    } else {
        lines.push('- Skill: run `burger-api skills install`');
    }
    lines.push('- Docs: https://burger-api.com/docs');
    lines.push('- LLM context: https://burger-api.com/llms.txt');
    lines.push('');

    return lines.join('\n');
}

/** CLAUDE.md for a new project: imports the shared rules in AGENTS.md. */
export function generateClaudeMd(): string {
    return [
        '<!-- Claude Code reads this file; the project rules live in AGENTS.md. -->',
        '@AGENTS.md',
        '',
    ].join('\n');
}

/** Injectable steps for tests; production uses the real implementations. */
export interface CreateProjectDeps {
    /** Skill downloader; defaults to the GitHub downloader. */
    download?: (name: string, targetDir: string) => Promise<number>;
}

/**
 * Create a new project scaffold.
 *
 * @param targetDir - Where to create the project
 * @param options - Project configuration from user prompts
 * @param deps - Optional injected steps (for tests)
 */
export async function createProject(
    targetDir: string,
    options: CreateOptions,
    deps: CreateProjectDeps = {}
): Promise<CreateProjectResult> {
    const spin = spinner('Creating project structure...');
    const lang: 'ts' | 'js' = options.lang === 'js' ? 'js' : 'ts';
    const ext = lang === 'js' ? 'js' : 'ts';
    // Normalize indentation of generated source (see reindent.ts).
    const write = (path: string, content: string) =>
        Bun.write(path, isReindentable(path) ? reindent(content) : content);

    try {
        await write(
            join(targetDir, 'package.json'),
            generatePackageJson(options.name, lang)
        );
        if (lang === 'js') {
            await write(
                join(targetDir, 'jsconfig.json'),
                generateJsConfig()
            );
        } else {
            await write(
                join(targetDir, 'tsconfig.json'),
                generateTsConfig()
            );
        }
        await write(join(targetDir, '.gitignore'), generateGitIgnore());
        await write(
            join(targetDir, '.prettierrc'),
            generatePrettierConfig()
        );
        await write(
            join(targetDir, `burger.build.${ext}`),
            generateBurgerConfig(options)
        );

        await write(
            join(targetDir, 'src', `index.${ext}`),
            generateIndexFile(options)
        );

        await write(
            join(targetDir, 'src', `openapi.config.${ext}`),
            generateOpenAPIConfig(options)
        );

        await write(
            join(targetDir, 'src', `hooks.${ext}`),
            generateHooksFile(lang)
        );
        await write(
            join(targetDir, 'src', `plugins.${ext}`),
            generatePluginsFile(lang)
        );
        await write(
            join(targetDir, 'src', `providers.${ext}`),
            generateProvidersFile(lang)
        );

        if (options.useApi) {
            const apiDir = join(targetDir, 'src', options.apiDir || 'api');
            const routeFiles = generateRouteFiles(
                'hello',
                {
                    schema: true,
                    openapi: true,
                    hooks: false,
                    config: false,
                },
                lang
            );
            for (const [name, content] of Object.entries(routeFiles)) {
                await write(join(apiDir, name), content);
            }
        }

        if (options.usePages) {
            const pagesDir = join(targetDir, 'src', options.pageDir || 'pages');
            await write(
                join(pagesDir, 'index.html'),
                generateIndexPage(options)
            );
        }

        // Sample assets live under the pages dir so the page router serves them.
        if (options.usePages) {
            const pagesDir = join(targetDir, 'src', options.pageDir || 'pages');
            await write(
                join(pagesDir, 'assets', 'css', 'style.css'),
                generateSampleCss()
            );
            await write(
                join(pagesDir, 'assets', 'js', 'app.js'),
                generateSampleJs()
            );
        }

        // A sample echo route, so an opted-in ws dir runs immediately.
        if (options.useWs) {
            const wsRouteDir = join(
                targetDir,
                'src',
                options.wsDir || 'websocket',
                'echo'
            );
            const wsFiles = generateWsFiles('echo', {}, lang);
            for (const [name, content] of Object.entries(wsFiles)) {
                await write(join(wsRouteDir, name), content);
            }
        }

        // No ecosystem/ stub: `burger-api add` creates those dirs on demand.

        spin.stop('Project files created');
    } catch (err) {
        spin.stop('Failed to create project', true);
        throw err;
    }

    // Download AI agent skills if requested. A failure never fails the
    // scaffold, but it is reported so `create` doesn't claim success.
    const result: CreateProjectResult = {};
    if (options.addSkills) {
        const skillSpin = spinner('Downloading AI agent skills...');
        try {
            // Downloads to .agents/skills/, then copies to .claude/skills/.
            await installSkill('burger-api', {
                baseDir: targetDir,
                download: deps.download,
            });
            skillSpin.stop('AI agent skills installed');
            result.skillsInstalled = true;
        } catch (err) {
            skillSpin.stop('Could not download AI agent skills', true);
            result.skillsInstalled = false;
            result.skillsError =
                err instanceof Error ? err.message : 'Unknown error';
        }
    }

    // Always written, also with --no-skills: AGENTS.md holds the project
    // rules; CLAUDE.md imports it for Claude Code.
    await Bun.write(
        join(targetDir, 'AGENTS.md'),
        generateAgentsMd(options, result.skillsInstalled === true)
    );
    await Bun.write(join(targetDir, 'CLAUDE.md'), generateClaudeMd());

    return result;
}

/** Outcome of the optional steps in {@link createProject}. */
export interface CreateProjectResult {
    /** undefined when skills were not requested. */
    skillsInstalled?: boolean;
    skillsError?: string;
}

/**
 * Install dependencies (`bun install`) in a project directory.
 *
 * @param projectDir - Directory containing package.json
 */
export async function installDependencies(projectDir: string): Promise<void> {
    const spin = spinner('Installing dependencies...');

    try {
        const proc = Bun.spawn(['bun', 'install'], {
            cwd: projectDir,
            stdout: 'ignore',
            stderr: 'pipe',
        });

        const exitCode = await proc.exited;

        let stderrText = '';
        try {
            stderrText = (await new Response(proc.stderr).text()).trim();
        } catch {
            // stderr may already be closed; avoid leaving a readable stream dangling
        }

        if (exitCode !== 0) {
            const message =
                stderrText.length > 0
                    ? `bun install failed:\n${stderrText}`
                    : 'bun install failed';
            throw new Error(message);
        }

        spin.stop('Dependencies installed!');
    } catch (err) {
        spin.stop('Failed to install dependencies', true);
        throw err;
    }
}

// ─────────────────────────────────────────────────────
// Generate command templates
// ─────────────────────────────────────────────────────

export interface GenerateRouteOptions {
    schema?: boolean;
    openapi?: boolean;
    hooks?: boolean;
    config?: boolean;
}

/**
 * Generate route convention files for `burger-api generate route <name>`.
 * Returns a map of filename → content.
 */
export function generateRouteFiles(
    routeName: string,
    options: GenerateRouteOptions = {},
    lang: 'ts' | 'js' = 'ts'
): Record<string, string> {
    const files: Record<string, string> = {};
    const ext = lang === 'js' ? 'js' : 'ts';

    // `users/[id]` → params ['id']; tag = first static segment ("users"),
    // skipping `(group)` folders and the wildcard.
    const segments = routeName.split('/').filter(Boolean);
    const params = segments
        .map((s) => /^\[([A-Za-z_$][\w$]*)\]$/.exec(s)?.[1])
        .filter((p): p is string => !!p);
    const tag =
        segments.find((s) => !/^[[(]/.test(s)) ?? segments[0] ?? routeName;
    const summary =
        params.length > 0
            ? `Get ${tag} by ${params.join(', ')}`
            : `${tag} endpoint`;

    // With a schema, the starter handler shows `defineRoute` typing
    // `ctx.validated` from schema.ts.
    if (options.schema !== false && params.length > 0) {
        files[`route.${ext}`] = [
            "import { defineRoute } from 'burger-api';",
            "import { GET as GetSchema } from './schema';",
            '',
            '// ctx.validated.params is typed from schema.ts.',
            'export const GET = defineRoute(GetSchema, (ctx) => {',
            `const { ${params.join(', ')} } = ctx.validated.params;`,
            `return Response.json({ ${params.join(', ')} });`,
            '});',
            '',
        ].join('\n');
    } else if (options.schema !== false) {
        files[`route.${ext}`] = [
            "import { defineRoute } from 'burger-api';",
            "import { GET as GetSchema } from './schema';",
            '',
            '// ctx.validated.query is typed from schema.ts. Try: ?name=Burger',
            'export const GET = defineRoute(GetSchema, (ctx) => {',
            'const { name } = ctx.validated.query;',
            'return Response.json({ message: `Hello, ${name}!` });',
            '});',
            '',
        ].join('\n');
    } else if (lang === 'js') {
        files['route.js'] = [
            '/**',
            " * @param {import('burger-api').BurgerContext} ctx",
            ' * @returns {Response}',
            ' */',
            'export function GET(ctx) {',
            'return Response.json({ ok: true });',
            '}',
            '',
        ].join('\n');
    } else {
        files['route.ts'] = [
            "import type { BurgerContext } from 'burger-api';",
            '',
            'export function GET(ctx: BurgerContext): Response {',
            'return Response.json({ ok: true });',
            '}',
            '',
        ].join('\n');
    }

    if (options.schema !== false) {
        const schemaBody =
            params.length > 0
                ? [
                      'export const GET = {',
                      'params: z.object({',
                      ...params.map((p) => `${p}: z.string(),`),
                      '}),',
                  ]
                : [
                      'export const GET = {',
                      'query: z.object({',
                      "name: z.string().default('world'),",
                      '}),',
                  ];
        if (lang === 'js') {
            files['schema.js'] = [
                "import { z } from 'zod';",
                '',
                // @satisfies keeps the literal type so defineRoute can infer
                // ctx.validated from it.
                "/** @satisfies {import('burger-api').MethodSchema} */",
                ...schemaBody,
                '};',
                '',
            ].join('\n');
        } else {
            files['schema.ts'] = [
                "import { z } from 'zod';",
                "import type { MethodSchema } from 'burger-api';",
                '',
                ...schemaBody,
                '} satisfies MethodSchema;',
                '',
            ].join('\n');
        }
    }

    if (options.openapi !== false) {
        if (lang === 'js') {
            files['openapi.js'] = [
                "/** @type {import('burger-api').OpenAPIMeta} */",
                `export const GET = {`,
                ` summary: ${JSON.stringify(summary)},`,
                ` tags: [${JSON.stringify(tag)}],`,
                `};`,
                '',
            ].join('\n');
        } else {
            files['openapi.ts'] = [
                "import type { OpenAPIMeta } from 'burger-api';",
                '',
                `export const GET = {`,
                ` summary: ${JSON.stringify(summary)},`,
                ` tags: [${JSON.stringify(tag)}],`,
                `} satisfies OpenAPIMeta;`,
                '',
            ].join('\n');
        }
    }

    if (options.hooks !== false) {
        if (lang === 'js') {
            files['hooks.js'] = [
                '/**',
                ' * Route-level hook.',
                ' * @param {import(\'burger-api\').BurgerContext} ctx',
                ' */',
                'export async function beforeRoute(ctx) {',
                ' // Route-level hook',
                '}',
                '',
            ].join('\n');
        } else {
            files['hooks.ts'] = [
                "import type { BurgerContext } from 'burger-api';",
                '',
                'export async function beforeRoute(ctx: BurgerContext) {',
                ' // Route-level hook',
                '}',
                '',
            ].join('\n');
        }
    }

    if (options.config !== false) {
        if (lang === 'js') {
            files['config.js'] = [
                "/** @type {import('burger-api').RouteConfig} */",
                'export default {',
                ' auth: false,',
                '};',
                '',
            ].join('\n');
        } else {
            files['config.ts'] = [
                "import type { RouteConfig } from 'burger-api';",
                '',
                'export default {',
                ' auth: false,',
                '} satisfies RouteConfig;',
                '',
            ].join('\n');
        }
    }

    return files;
}

/**
 * JS identifier for a hook/plugin name: `rate-limit` → `rateLimit`
 * (`RateLimit` with `pascal`); any accepted name yields valid code.
 */
export function toIdentifier(name: string, pascal = false): string {
    let id = name
        .replace(/[-_\s]+([A-Za-z0-9])/g, (_, c: string) => c.toUpperCase())
        .replace(/[^A-Za-z0-9_$]/g, '_');
    if (/^[0-9]/.test(id)) id = `_${id}`;
    return pascal ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

/**
 * Generate a hook factory template for `burger-api generate hook <name>`.
 */
export function generateHookTemplate(
    rawHookName: string,
    lang: 'ts' | 'js' = 'ts'
): string {
    const hookName = toIdentifier(rawHookName);
    if (lang === 'js') {
        return [
            `/**`,
            ` * ${hookName} hook factory.`,
            ` * Import and register in src/hooks.js.`,
            ` */`,
            `export function ${hookName}() {`,
            ` /** @param {import('burger-api').BurgerContext} ctx */`,
            ` return async (ctx) => {`,
            ` // hook logic`,
            ` };`,
            `}`,
            '',
        ].join('\n');
    }
    return [
        `/**`,
        ` * ${hookName} hook factory.`,
        ` * Import and register in src/hooks.ts.`,
        ` */`,
        `export function ${hookName}() {`,
        ` return async (ctx: import('burger-api').BurgerContext) => {`,
        ` // hook logic`,
        ` };`,
        `}`,
        '',
    ].join('\n');
}

/**
 * Generate a plugin template for `burger-api generate plugin <name>`.
 */
export function generatePluginTemplate(
    pluginName: string,
    lang: 'ts' | 'js' = 'ts'
): string {
    // Sanitize: the name doubles as a JS identifier.
    const className = toIdentifier(pluginName, true);
    if (lang === 'js') {
        return [
            `/**`,
            ` * ${className} plugin.`,
            ` * Import and register in src/plugins.js via burger.usePlugin().`,
            ` */`,
            `/** @type {import('burger-api').Plugin} */`,
            `export const ${className} = {`,
            ` name: ${JSON.stringify(pluginName)},`,
            ` hooks: {`,
            ` // transform, beforeRoute, afterRoute, etc.`,
            ` },`,
            `};`,
            '',
        ].join('\n');
    }
    return [
        `/**`,
        ` * ${className} plugin.`,
        ` * Import and register in src/plugins.ts via burger.usePlugin().`,
        ` */`,
        `import type { Plugin } from 'burger-api';`,
        ``,
        `export const ${className}: Plugin = {`,
        ` name: ${JSON.stringify(pluginName)},`,
        ` hooks: {`,
        ` // transform, beforeRoute, afterRoute, etc.`,
        ` },`,
        `};`,
        '',
    ].join('\n');
}

// ─────────────────────────────────────────────────────
// Generate WebSocket templates
// ─────────────────────────────────────────────────────

export interface GenerateWsOptions {
    hooks?: boolean;
    config?: boolean;
}

/**
 * Generate WebSocket convention files for `burger-api generate ws <path>`.
 * Returns a map of filename → content.
 */
export function generateWsFiles(
    routePath: string,
    options: GenerateWsOptions = {},
    lang: 'ts' | 'js' = 'ts'
): Record<string, string> {
    const files: Record<string, string> = {};
    const ext = lang === 'js' ? 'js' : 'ts';

    if (lang === 'js') {
        files['ws.js'] = [
            '/** @param {import(\'burger-api\').BurgerWS} ws */',
            'export function open(ws) {',
            ' // Handle new connection',
            ' ws.send(JSON.stringify({ type: "connected" }));',
            '}',
            '',
            '/**',
            ' * @param {import(\'burger-api\').BurgerWS} ws',
            ' * @param {string | Buffer} message',
            ' */',
            'export function message(ws, message) {',
            ' // Echo every message back to the sender',
            ' ws.send(message);',
            '}',
            '',
            '/**',
            ' * @param {import(\'burger-api\').BurgerWS} ws',
            ' * @param {number} code',
            ' * @param {string} reason',
            ' */',
            'export function close(ws, code, reason) {',
            ' // Handle connection close',
            '}',
            '',
        ].join('\n');
    } else {
        files['ws.ts'] = [
            "import type { BurgerWS } from 'burger-api';",
            '',
            'export function open(ws: BurgerWS) {',
            ' // Handle new connection',
            ' ws.send(JSON.stringify({ type: "connected" }));',
            '}',
            '',
            'export function message(ws: BurgerWS, message: string | Buffer) {',
            ' // Echo every message back to the sender',
            ' ws.send(message);',
            '}',
            '',
            'export function close(ws: BurgerWS, code: number, reason: string) {',
            ' // Handle connection close',
            '}',
            '',
        ].join('\n');
    }

    if (options.hooks !== false) {
        if (lang === 'js') {
            files['hooks.js'] = [
                '/** @param {import(\'burger-api\').BurgerWS} ws */',
                'export function onOpen(ws) {',
                ' // Runs before open handler',
                '}',
                '',
                '/**',
                ' * @param {import(\'burger-api\').BurgerWS} ws',
                ' * @param {string | Buffer} message',
                ' */',
                'export function onMessage(ws, message) {',
                ' // Runs before message handler',
                '}',
                '',
                '/**',
                ' * @param {import(\'burger-api\').BurgerWS} ws',
                ' * @param {number} code',
                ' * @param {string} reason',
                ' */',
                'export function onClose(ws, code, reason) {',
                ' // Runs before close handler',
                '}',
                '',
            ].join('\n');
        } else {
            files['hooks.ts'] = [
                "import type { BurgerWS } from 'burger-api';",
                '',
                'export function onOpen(ws: BurgerWS) {',
                ' // Runs before open handler',
                '}',
                '',
                'export function onMessage(ws: BurgerWS, message: string | Buffer) {',
                ' // Runs before message handler',
                '}',
                '',
                'export function onClose(ws: BurgerWS, code: number, reason: string) {',
                ' // Runs before close handler',
                '}',
                '',
            ].join('\n');
        }
    }

    if (options.config !== false) {
        if (lang === 'js') {
            files['config.js'] = [
                "/** @type {import('burger-api').WebSocketConfig} */",
                'export default {',
                ' // Per-route auth override. Connection-level socket options',
                ' // must be set globally via burger.wsConfig() instead.',
                ' // auth: { required: true },',
                '};',
                '',
            ].join('\n');
        } else {
            files['config.ts'] = [
                "import type { WebSocketConfig } from 'burger-api';",
                '',
                'export default {',
                ' // Per-route auth override. Connection-level socket options',
                ' // must be set globally via burger.wsConfig() instead.',
                ' // auth: { required: true },',
                '} satisfies WebSocketConfig;',
                '',
            ].join('\n');
        }
    }

    return files;
}
