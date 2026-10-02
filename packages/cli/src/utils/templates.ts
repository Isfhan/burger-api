/** Scaffolding templates and generated files for `burger-api create` and `generate`. */

import { join, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';

import type { CreateOptions } from '../types/index';
import { spinner, warning } from './logger';
import { installSkill } from './skills';
import { isLocalMode } from './local-mode';
import { reindent, isReindentable } from './reindent';

/** Injected at build time when compiling to executable (--define CLI_VERSION). */
declare const CLI_VERSION: string | undefined;

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
    let burgerApiRoot: string | undefined;
    try {
        const burgerApiEntry = Bun.resolveSync('burger-api', import.meta.dir);
        burgerApiRoot = findPackageRoot(burgerApiEntry);
    } catch {
        // Fall through to the warning below.
    }

    if (burgerApiRoot) {
        try {
            const zodEntry = Bun.resolveSync('zod', burgerApiRoot);
            const zodRoot = findPackageRoot(zodEntry);
            if (zodRoot) {
                const zodPkg = JSON.parse(
                    readFileSync(join(zodRoot, 'package.json'), 'utf-8')
                ) as { version?: string };
                if (zodPkg.version) return zodPkg.version;
            }
        } catch {
            // Installed zod not resolvable — use burger-api's own range.
        }

        try {
            const burgerApiPkg = JSON.parse(
                readFileSync(join(burgerApiRoot, 'package.json'), 'utf-8')
            ) as { dependencies?: Record<string, string> };
            const range = burgerApiPkg.dependencies?.zod;
            if (range) return range;
        } catch {
            // Fall through to the warning below.
        }
    }

    warning(
        `Could not resolve burger-api's zod version; pinning ${FALLBACK} in the scaffold.`
    );
    return FALLBACK;
}

/**
 * The running CLI's own version: the build-time `CLI_VERSION` define first
 * (a compiled binary has no package.json next to it), then package.json.
 */
function cliVersion(): string | undefined {
    if (typeof CLI_VERSION !== 'undefined') return CLI_VERSION;
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
 * `@burger-api/cli` specifier for scaffolded devDependencies: the checkout's
 * link in local mode, otherwise `^<this CLI's version>`.
 */
function cliSpecifier(): string {
    if (isLocalMode()) return 'link:@burger-api/cli';
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
    // Local mode: both packages come from the checkout via `bun link`.
    // Otherwise `^1.0.0-beta`, so scaffolds resolve prereleases at all
    // (`^1.0.0` would exclude them) and pick up later betas and stable 1.x.
    const local = isLocalMode();
    const burgerApiSpecifier = local ? 'link:burger-api' : '^1.0.0-beta';
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
    return `/* BurgerAPI starter page: same look as burger-api.com */
:root {
    --primary: #ffa62b;
    --secondary: #ffb84d;
    --accent: #ffc861;
    --success: #10b981;

    --bg: #f7f7f5;
    --bg-2: #f2f2ef;
    --card: #ffffff;
    --card-soft: #fcfcfa;
    --border: rgba(0, 0, 0, 0.06);
    --text: #0a0a0b;
    --text-2: #3f3f46;
    --muted: #52525b;
    --btn-2: #ecece8;
    --btn-2-hover: #e3e3df;
    --code-bg: #111214;
    --grid: rgba(0, 0, 0, 0.04);
    --orb: rgba(255, 166, 43, 0.22);

    --shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 16px 40px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.12);

    --font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
    :root {
        --primary: #ffb84d;
        --bg: #09090b;
        --bg-2: #0f1012;
        --card: #17181c;
        --card-soft: #141519;
        --border: rgba(255, 255, 255, 0.08);
        --text: #fafafa;
        --text-2: #d4d4d8;
        --muted: #a1a1aa;
        --btn-2: rgba(255, 255, 255, 0.05);
        --btn-2-hover: rgba(255, 255, 255, 0.08);
        --code-bg: #0d0e10;
        --grid: rgba(255, 255, 255, 0.035);
        --orb: rgba(255, 166, 43, 0.16);
        --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.4);
        --shadow-md: 0 16px 40px rgba(0, 0, 0, 0.5);
        --shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.6);
    }
}

*,
*::before,
*::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 17px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
}

a {
    color: inherit;
    text-decoration: none;
}

code {
    font-family: var(--mono);
    font-size: 0.85em;
    padding: 2px 8px;
    border-radius: 8px;
    background: var(--btn-2);
    border: 1px solid var(--border);
    white-space: nowrap;
}

/* Background: very subtle grid + blurred orange glow */
.bg-grid {
    position: fixed;
    inset: 0;
    z-index: -2;
    background-image: linear-gradient(var(--grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse at 50% 0%, #000 30%, transparent 75%);
}

.orb {
    position: fixed;
    z-index: -1;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: var(--orb);
    filter: blur(110px);
    pointer-events: none;
}

.orb-a {
    top: -220px;
    left: 50%;
    transform: translateX(-70%);
}

.orb-b {
    top: 120px;
    right: -260px;
    opacity: 0.6;
}

.container {
    width: 100%;
    max-width: 1040px;
    margin: 0 auto;
    padding: 0 24px;
}

/* Navbar */
.nav {
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(12px);
    background: color-mix(in srgb, var(--bg) 72%, transparent);
    border-bottom: 1px solid var(--border);
}

.nav .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 17px;
}

.brand img {
    width: 30px;
    height: 30px;
}

.nav-links {
    display: flex;
    gap: 24px;
    font-size: 14px;
    font-weight: 500;
    color: var(--muted);
}

.nav-links a:hover {
    color: var(--text);
}

/* Hero */
.hero {
    padding: 96px 0 72px;
    text-align: center;
}

.status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-2);
    background: var(--btn-2);
    border: 1px solid var(--border);
}

.status .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5);
    animation: pulse 2s ease-out infinite;
}

@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
    70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.hero-logo {
    display: block;
    width: 88px;
    height: 88px;
    margin: 32px auto 24px;
    filter: drop-shadow(0 12px 28px rgba(255, 166, 43, 0.35));
    animation: rise 0.6s ease-out both;
}

.hero h1 {
    font-size: clamp(44px, 7vw, 72px);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.03em;
    animation: rise 0.6s 0.05s ease-out both;
}

.hero h1 .accent {
    background: linear-gradient(135deg, var(--accent), var(--primary));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}

.hero .lead {
    max-width: 600px;
    margin: 16px auto 0;
    font-size: 17px;
    color: var(--muted);
    animation: rise 0.6s 0.1s ease-out both;
}

@keyframes rise {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Buttons */
.actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 32px;
    animation: rise 0.6s 0.15s ease-out both;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 48px;
    padding: 0 22px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 700;
    transition: transform 180ms ease-out, box-shadow 180ms ease-out,
        background 180ms ease-out, filter 180ms ease-out;
}

.btn:focus-visible,
.copy:focus-visible,
.inline-link:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
}

.btn-primary {
    min-width: 160px;
    color: #1a1206;
    background: linear-gradient(135deg, var(--accent), var(--primary));
    box-shadow: 0 8px 24px rgba(255, 166, 43, 0.35);
}

.btn-primary:hover {
    transform: translateY(-2px);
    filter: brightness(1.05);
    box-shadow: 0 12px 32px rgba(255, 166, 43, 0.45);
}

.btn-secondary {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    background: var(--btn-2);
    border: 1px solid var(--border);
    backdrop-filter: blur(8px);
}

.btn-secondary:hover {
    transform: translateY(-2px);
    background: var(--btn-2-hover);
    box-shadow: var(--shadow-sm);
}

.btn .arrow {
    transition: transform 180ms ease-out;
}

.btn:hover .arrow {
    transform: translateX(3px);
}

/* Sections and cards */
.section {
    padding: 64px 0;
}

.section-alt {
    background: var(--bg-2);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
}

.section h2 {
    font-size: clamp(28px, 4vw, 36px);
    font-weight: 700;
    letter-spacing: -0.02em;
}

.section .desc {
    margin-top: 16px;
    color: var(--muted);
    font-size: 16px;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
    margin-top: 32px;
}

.card {
    padding: 28px;
    border-radius: 16px;
    background: linear-gradient(180deg, var(--card), var(--card-soft));
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    transition: transform 180ms ease-out, box-shadow 180ms ease-out;
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
}

.card h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
}

.card p {
    font-size: 15px;
    color: var(--muted);
}

.card p + p {
    margin-top: 10px;
}

.card .icon {
    display: inline-flex;
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    border-radius: 12px;
    font-size: 20px;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.link-list {
    list-style: none;
    display: grid;
    gap: 10px;
}

.inline-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 500;
    color: var(--primary);
    transition: color 180ms ease-out;
}

.inline-link span {
    transition: transform 180ms ease-out;
}

.inline-link:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
}

.inline-link:hover span {
    transform: translateX(4px);
}

/* Terminal */
.terminal {
    margin-top: 32px;
    border-radius: 18px;
    background: var(--code-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
}

.terminal-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.terminal-bar i {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
}

.terminal-bar .title {
    margin-left: 8px;
    font-family: var(--mono);
    font-size: 12px;
    color: #a1a1aa;
}

.terminal-body {
    padding: 12px 8px;
}

.cmd {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    font-family: var(--mono);
    font-size: 14px;
    color: #fafafa;
}

.cmd:hover {
    background: rgba(255, 255, 255, 0.04);
}

.cmd .prompt {
    color: #ffb84d;
}

.cmd .text {
    flex: 1;
    overflow-x: auto;
    white-space: nowrap;
}

.cmd .comment {
    color: #71717a;
}

.copy {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: #d4d4d8;
    font: 500 12px var(--font);
    padding: 4px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 180ms ease-out;
}

.copy:hover {
    background: rgba(255, 255, 255, 0.1);
}

/* Footer */
.footer {
    padding: 40px 0 56px;
    border-top: 1px solid var(--border);
    font-size: 14px;
    color: var(--muted);
}

.footer .container {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
}

.footer nav {
    display: flex;
    gap: 20px;
}

.footer a:hover {
    color: var(--text);
}

@media (max-width: 640px) {
    .nav-links {
        display: none;
    }
    .hero {
        padding: 64px 0 48px;
    }
    .cmd .comment {
        display: none;
    }
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation: none !important;
        transition: none !important;
    }
}
`;
}

/** The sample page script (app.js): copy buttons for the commands. */
export function generateSampleJs(): string {
    return `// Copy a command to the clipboard.
for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(button.dataset.copy);
            button.textContent = 'Copied';
        } catch {
            button.textContent = 'Press Ctrl+C';
        }
        setTimeout(() => (button.textContent = 'Copy'), 1500);
    });
}
`;
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
 * The scaffolded landing page (index.html), in the burger-api.com style.
 *
 * @param options - Project configuration (name, dirs, apiPrefix, useApi)
 * @returns index.html content as a string
 */
export function generateIndexPage(options: CreateOptions): string {
    const projectName = escapeHtml(options.name);
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

    // API docs exist only when the app has API routes.
    const actions = options.useApi
        ? `<a href="/docs" class="btn btn-primary">API Docs <span class="arrow">→</span></a>
 <a href="${apiTryHref}" class="btn btn-secondary">Try API</a>
 <a href="/openapi.json" class="btn btn-secondary">OpenAPI</a>`
        : `<a href="https://burger-api.com/docs" class="btn btn-primary" target="_blank" rel="noopener">Documentation <span class="arrow">→</span></a>`;

    const apiCard = options.useApi
        ? `
 <div class="card">
 <div class="icon">⚡</div>
 <h3>Edit your API</h3>
 <p>Change <code>${apiHintPath}</code> and save. The endpoint reloads on its own.</p>
 <p>Add routes with <code>burger-api generate route users</code>.</p>
 </div>`
        : '';

    const commands: Array<[string, string]> = [
        ['burger-api add cors logger', 'Add hooks'],
        ...(options.useApi
            ? ([['burger-api generate route users', 'New route']] as Array<
                  [string, string]
              >)
            : []),
        ['burger-api doctor', 'Check the project'],
        ['bun run build', 'Build for production'],
    ];
    const commandRows = commands
        .map(
            ([cmd, note]) => ` <div class="cmd">
 <span class="prompt">$</span>
 <span class="text">${escapeHtml(cmd)} <span class="comment"># ${escapeHtml(note)}</span></span>
 <button class="copy" type="button" data-copy="${escapeHtml(cmd)}">Copy</button>
 </div>`
        )
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <meta name="color-scheme" content="light dark">
 <title>${projectName} · BurgerAPI</title>
 <link rel="icon" type="image/png" href="https://burger-api.com/img/logo.png">
 <link rel="preconnect" href="https://fonts.googleapis.com">
 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
 <link rel="stylesheet" href="${assetBase}/css/style.css" />
 <script src="${assetBase}/js/app.js" type="module"></script>
</head>
<body>
 <div class="bg-grid" aria-hidden="true"></div>
 <div class="orb orb-a" aria-hidden="true"></div>
 <div class="orb orb-b" aria-hidden="true"></div>

 <header class="nav">
 <div class="container">
 <a href="https://burger-api.com" class="brand" target="_blank" rel="noopener">
 <img src="https://burger-api.com/img/logo.png" alt="">
 BurgerAPI
 </a>
 <nav class="nav-links">
 <a href="https://burger-api.com/docs" target="_blank" rel="noopener">Docs</a>
 <a href="https://github.com/isfhan/burger-api" target="_blank" rel="noopener">GitHub</a>
 </nav>
 </div>
 </header>

 <main>
 <section class="hero">
 <div class="container">
 <span class="status"><span class="dot"></span>Server running</span>
 <img src="https://burger-api.com/img/logo.png" alt="BurgerAPI logo" class="hero-logo">
 <h1>${projectName} is <span class="accent">ready</span></h1>
 <p class="lead">Your BurgerAPI app is up and running. Edit a file and save: the server reloads on its own.</p>
 <div class="actions">
 ${actions}
 </div>
 </div>
 </section>

 <section class="section section-alt">
 <div class="container">
 <h2>Start building</h2>
 <p class="desc">Everything lives in <code>src/</code>. Folders become routes.</p>
 <div class="grid">
 <div class="card">
 <div class="icon">📄</div>
 <h3>Edit this page</h3>
 <p>Change <code>${pageHintPath}</code> and save to see it here.</p>
 <p>Styles and scripts live in <code>src/${escapeHtml(pageDir)}/assets/</code>.</p>
 </div>${apiCard}
 <div class="card">
 <div class="icon">🤖</div>
 <h3>Work with AI agents</h3>
 <p><code>AGENTS.md</code> tells your coding agent how this project works.</p>
 </div>
 </div>
 </div>
 </section>

 <section class="section">
 <div class="container">
 <h2>Next steps</h2>
 <p class="desc">A few commands you will use often.</p>
 <div class="terminal">
 <div class="terminal-bar"><i></i><i></i><i></i><span class="title">${projectName}</span></div>
 <div class="terminal-body">
${commandRows}
 </div>
 </div>
 </div>
 </section>

 <section class="section section-alt">
 <div class="container">
 <h2>Learn more</h2>
 <div class="grid">
 <div class="card">
 <h3>Documentation</h3>
 <ul class="link-list">
 <li><a class="inline-link" href="https://burger-api.com/docs" target="_blank" rel="noopener">Getting started <span>→</span></a></li>
 <li><a class="inline-link" href="https://burger-api.com/docs/core/configuration" target="_blank" rel="noopener">Configuration <span>→</span></a></li>
 <li><a class="inline-link" href="https://burger-api.com/docs/core/request-handling" target="_blank" rel="noopener">Request handling <span>→</span></a></li>
 </ul>
 </div>
 <div class="card">
 <h3>Resources</h3>
 <ul class="link-list">
 <li><a class="inline-link" href="https://github.com/isfhan/burger-api" target="_blank" rel="noopener">GitHub <span>→</span></a></li>
 <li><a class="inline-link" href="https://www.npmjs.com/package/burger-api" target="_blank" rel="noopener">npm package <span>→</span></a></li>
 <li><a class="inline-link" href="https://github.com/isfhan/burger-api/issues" target="_blank" rel="noopener">Report an issue <span>→</span></a></li>
 </ul>
 </div>
 <div class="card">
 <h3>Community</h3>
 <ul class="link-list">
 <li><a class="inline-link" href="https://github.com/isfhan/burger-api/discussions" target="_blank" rel="noopener">Discussions <span>→</span></a></li>
 <li><a class="inline-link" href="https://github.com/isfhan/burger-api" target="_blank" rel="noopener">Contribute <span>→</span></a></li>
 <li><a class="inline-link" href="https://github.com/isfhan/burger-api/stargazers" target="_blank" rel="noopener">Star on GitHub <span>→</span></a></li>
 </ul>
 </div>
 </div>
 </div>
 </section>
 </main>

 <footer class="footer">
 <div class="container">
 <span>BurgerAPI v1.0.0-beta · Bun 1.3+</span>
 <nav>
 <a href="https://burger-api.com" target="_blank" rel="noopener">Website</a>
 <a href="https://github.com/isfhan/burger-api" target="_blank" rel="noopener">GitHub</a>
 <a href="https://www.npmjs.com/package/burger-api" target="_blank" rel="noopener">npm</a>
 </nav>
 </div>
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
 * `src/types.ts` (TypeScript projects only): app-wide type extensions.
 * Everything is commented out so a fresh scaffold typechecks until the user
 * opts in.
 */
export function generateTypesFile(): string {
    return `// App-wide type extensions. Uncomment to extend burger-api interfaces
// project-wide (ctx.config, ctx.services, ...).
//
// declare module 'burger-api' {
//     interface RouteConfig {
//         auth?: boolean | { required?: boolean; roles?: string[] };
//         cache?: number;
//     }
//
//     interface BurgerServices {
//         db: Database;
//     }
// }

export {};
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
    if (ext === 'ts') {
        lines.push(
            '- `src/types.ts` - app-wide type extensions (module augmentation)'
        );
    }
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
    lines.push(
        `\`config.${ext}\` uses \`export default\` for the whole route and named method exports (e.g. \`export const POST = { auth: { required: true } }\`) to override for one method.`
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
    lines.push(
        '- WebSocket handlers read `ws.url` / `ws.query`; HTTP handlers send to WS topic subscribers with `ctx.publish(topic, message)` (Bun).'
    );
    if (ext === 'ts') {
        lines.push(
            '- App-wide type extensions (e.g. `ctx.services`) go in `src/types.ts` via `declare module \'burger-api\'`.'
        );
    }
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

        // TS-only: a home for app-wide module augmentation. JS projects have
        // no ambient type layer, so no file is written.
        if (lang === 'ts') {
            await write(
                join(targetDir, 'src', 'types.ts'),
                generateTypesFile()
            );
        }

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

    // Always written, also with --no-skills. Claude Code and other agents
    // read AGENTS.md directly.
    await Bun.write(
        join(targetDir, 'AGENTS.md'),
        generateAgentsMd(options, result.skillsInstalled === true)
    );

    return result;
}

/** Outcome of the optional steps in {@link createProject}. */
export interface CreateProjectResult {
    /** undefined when skills were not requested. */
    skillsInstalled?: boolean;
    skillsError?: string;
}

/**
 * Hint for `bun install` failing with "No version matching" for burger-api or
 * @burger-api/cli: the scaffolded version is not on npm (yet), so a checkout
 * should use local mode.
 */
export function unpublishedVersionHint(
    stderr: string
): string | undefined {
    if (!/No version matching/i.test(stderr)) return undefined;
    if (!/burger-api|@burger-api\/cli/.test(stderr)) return undefined;
    return (
        'burger-api or @burger-api/cli has no published version matching this ' +
        'scaffold yet. When working from a checkout, pass --local (or set ' +
        'BURGER_API_LOCAL=1) to use bun link instead of npm.'
    );
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
            let message =
                stderrText.length > 0
                    ? `bun install failed:\n${stderrText}`
                    : 'bun install failed';
            const hint = unpublishedVersionHint(stderrText);
            if (hint) message += `\n\nHint: ${hint}`;
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
            ` * Plugins add hooks; services (database, clients) go in`,
            ` * src/providers.js via burger.provide().`,
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
        ` * Plugins add hooks; services (database, clients) go in`,
        ` * src/providers.ts via burger.provide().`,
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
