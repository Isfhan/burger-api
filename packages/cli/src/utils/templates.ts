/**
 * Template Management System
 *
 * Handles downloading and caching project templates.
 * Templates are the starter projects users get when running `burger-api create`
 *
 */

import { join, resolve } from 'path';

import type { CreateOptions } from '../types/index';
import { spinner } from './logger';
import { downloadSkill } from './github';

/**
 * Resolve a local burger-api source override from the BURGER_API_SOURCE env
 * var (pre-release testing aid):
 * - unset  → null — generatePackageJson keeps the npm range (default)
 * - "link" → "link:burger-api" — resolves via the global bun link store
 * - <path> → "file:<absolute path>" — resolves from a local checkout
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

/**
 * Generate package.json content for a new project
 * This includes the burger-api dependency and basic scripts
 *
 * @param projectName - Name of the project
 * @returns package.json content as a string
 */
export function generatePackageJson(
    projectName: string,
    lang: 'ts' | 'js' = 'ts'
): string {
    const entry = lang === 'js' ? 'src/index.js' : 'src/index.ts';
    const burgerApiSpecifier =
        burgerApiSourceOverride()?.specifier ?? '^1.0.0';
    const packageJson = {
        name: projectName,
        version: '0.1.0',
        type: 'module',
        scripts: {
            dev: lang === 'js' ? 'burger-api dev -f src/index.js' : 'burger-api dev',
            start:
                lang === 'js'
                    ? 'burger-api start -f src/index.js'
                    : 'burger-api start',
            build: `burger-api build ${entry}`,
            // tsc reads tsconfig.json for TS projects; JS projects use
            // jsconfig.json (plain `tsc` would print help instead of checking).
            typecheck:
                lang === 'js'
                    ? 'tsc -p jsconfig.json --noEmit'
                    : 'tsc --noEmit',
        },
        dependencies: {
            'burger-api': burgerApiSpecifier,
            zod: '^4.0.17',
        },
        devDependencies: {
            '@types/bun': 'latest',
            typescript: '^5',
        },
    };

    return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate tsconfig.json content for a new project
 * This sets up TypeScript properly for Bun
 *
 * @returns tsconfig.json content as a string
 */
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

/**
 * Generate jsconfig.json for JavaScript projects (`--lang js`).
 * Enables editor type-checking of JSDoc annotations (checkJs).
 *
 * @returns jsconfig.json content as a string
 */
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

/**
 * Generate .gitignore content
 *
 * @returns .gitignore content as a string
 */
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

/**
 * Generate .prettierrc content
 * This matches the burger-api project style
 *
 * @returns .prettierrc content as a string
 */
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

/**
 * Generate index.ts content based on user options
 * This is the main entry point for the user's project
 *
 * @param options - Project configuration from user prompts
 * @returns index.ts content as a string
 */
export function generateIndexFile(options: CreateOptions): string {
    const lines: string[] = [];

    // Import statement
    lines.push("import { Burger } from 'burger-api';");
    lines.push('');

    // Configuration object
    lines.push('const app = new Burger({');

    if (options.useApi) {
        lines.push(` apiDir: './src/${options.apiDir || 'api'}',`);
        if (options.apiPrefix && options.apiPrefix !== '/api') {
            lines.push(` apiPrefix: ${JSON.stringify(options.apiPrefix)},`);
        }
    }

    if (options.usePages) {
        lines.push(` pageDir: './src/${options.pageDir || 'pages'}',`);
        if (options.pagePrefix && options.pagePrefix !== '/') {
            lines.push(` pagePrefix: ${JSON.stringify(options.pagePrefix)},`);
        }
    }

    if (options.debug) {
        lines.push(' debug: true,');
    }

    lines.push('});');
    lines.push('');

    // Start server - uses PORT env variable for flexibility (e.g., burger-api start --port 4000)
    lines.push('const port = Number(process.env.PORT) || 4000;');
    lines.push('app.serve(port, () => {');
    lines.push(' console.log(`Server running on http://localhost:${port}`);');
    lines.push('});');

    return lines.join('\n');
}

/**
 * Generate burger.build.ts from create command answers.
 * This keeps build/runtime config explicit in scaffolded projects.
 *
 * @param options - Project configuration from user prompts
 * @returns burger.build.ts content as a string
 */
export function generateBurgerConfig(options: CreateOptions): string {
    const apiDir = `./src/${options.apiDir || 'api'}`;
    const pageDir = `./src/${options.pageDir || 'pages'}`;
    const apiPrefix = options.apiPrefix || '/api';
    const pagePrefix = options.pagePrefix || '/';
    const debug = Boolean(options.debug);

    const body = [
        ` apiDir: ${JSON.stringify(apiDir)}, // folder with API route files`,
        ` pageDir: ${JSON.stringify(pageDir)}, // folder with HTML pages`,
        ` apiPrefix: ${JSON.stringify(apiPrefix)}, // URL prefix for API routes`,
        ` pagePrefix: ${JSON.stringify(pagePrefix)}, // URL prefix for pages`,
        ` debug: ${debug}, // extra logging when true`,
    ].join('\n');

    if (options.lang === 'js') {
        return [
            '/**',
            ' * BurgerAPI build and dev config.',
            ' * Used by the CLI for build (burger-api build) and by your app if you load it.',
            ' * Edit these paths and prefixes to match your project.',
            ' */',
            "/** @type {import('burger-api').BuildConfig} */",
            'export default {',
            body,
            '};',
            '',
        ].join('\n');
    }
    return [
        '/**',
        ' * BurgerAPI build and dev config.',
        ' * Used by the CLI for build (burger-api build) and by your app if you load it.',
        ' * Edit these paths and prefixes to match your project.',
        ' */',
        "import type { BuildConfig } from 'burger-api';",
        '',
        'export default {',
        body,
        '} satisfies BuildConfig;',
        '',
    ].join('\n');
}

/**
 * Generate a CSS file with modern styling for the landing page
 *
 * @returns style.css content as a string
 */
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

/**
 * Generate a sample JavaScript file with useful utilities
 *
 * @returns app.js content as a string
 */
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
 * Generate a minimal, clean landing page
 * Uses official BurgerAPI color scheme
 *
 * @param options - Project configuration (name, dirs, apiPrefix, useApi)
 * @returns index.html content as a string
 */
export function generateIndexPage(options: CreateOptions): string {
    const projectName = options.name;
    const pageDir = options.pageDir || 'pages';
    const apiDir = options.apiDir || 'api';
    const apiTryHref = escapeHtml(hrefFromApiPrefix(options.apiPrefix));

    const pageHintPath = escapeHtml(`src/${pageDir}/index.html`);
    const apiHintPath = escapeHtml(`src/${apiDir}/route.ts`);

    const editHintParagraphs = options.useApi
        ? `<p>Edit <code>${pageHintPath}</code> and save to reload the page.</p>
 <p>Edit <code>${apiHintPath}</code> and save to reload the API endpoint.</p>`
        : `<p>Edit <code>${pageHintPath}</code> and save to reload the page.</p>`;

    const tryApiLink = options.useApi
        ? `<a href="${apiTryHref}" class="link">Try API</a>`
        : '';

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
 <link rel="stylesheet" href="./assets/css/style.css" />
 <!-- Assets: Scripts -->
 <script src="./assets/js/app.js" type="module"></script>
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
 <span class="cmd">burger-api build src/index.ts</span>
 <span class="comment"># Build for production</span>
 </div>
 </div>
 </section>

 <!-- Action Links -->
 <div class="links">
 <a href="/docs" class="link primary">API Docs</a>
 ${tryApiLink}
 <a href="/openapi.json" class="link">OpenAPI</a>
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
 <div class="version">BurgerAPI v1.0.0 • Bun v1.3+</div>
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

/**
 * Generate hooks index file
 * This is where users will export their hooks
 *
 * @returns hooks/index.ts content as a string
 */
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

/** @param {import('burger-api').Burger} burger */
export default (burger) => {
 // burger.usePlugin(myPlugin);
};
`;
    }
    return `import type { Burger } from 'burger-api';

export default (burger: Burger) => {
 // burger.usePlugin(myPlugin);
};
`;
}

export function generateProvidersFile(lang: 'ts' | 'js' = 'ts'): string {
    if (lang === 'js') {
        return `// Register services here — injected into ctx.services.
// burger.provide('db', myDatabase);

/** @param {import('burger-api').Burger} burger */
export default (burger) => {
 // burger.provide('db', myDatabase);
};
`;
    }
    return `import type { Burger } from 'burger-api';

export default (burger: Burger) => {
 // burger.provide('db', myDatabase);
};
`;
}

export function generateHooksIndex(lang: 'ts' | 'js' = 'ts'): string {
    if (lang === 'js') {
        return `/**
 * Route Hooks
 * 
 * Define lifecycle hooks in hooks.js files. Example (api/hooks.js):
 * 
 * import { cors } from './cors/cors';
 * import { logger } from './logger/logger';
 * 
 * export const beforeRoute = [
 * logger(),
 * cors(),
 * ];
 */

export const beforeRoute = [];
`;
    }
    return `/**
 * Route Hooks
 * 
 * Define lifecycle hooks in hooks.ts files. Example (api/hooks.ts):
 * 
 * import { cors } from './cors/cors';
 * import { logger } from './logger/logger';
 * 
 * export const beforeRoute = [
 * logger(),
 * cors(),
 * ];
 */

export const beforeRoute: unknown[] = [];
`;
}

/**
 * Generate openapi.config.ts content
 * Convention file for OpenAPI metadata, docs UI, and docs auth.
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
    lines.push(' servers: [');
    lines.push(
        ' { url: "http://localhost:4000", description: "Development" },'
    );
    lines.push(' ],');
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
 * Create a new project with all necessary files
 * This is the main function that sets up everything
 *
 * @param targetDir - Where to create the project
 * @param options - Project configuration from user prompts
 */
export async function createProject(
    targetDir: string,
    options: CreateOptions
): Promise<void> {
    const spin = spinner('Creating project structure...');
    const lang: 'ts' | 'js' = options.lang === 'js' ? 'js' : 'ts';
    const ext = lang === 'js' ? 'js' : 'ts';

    try {
        // Create base files that every project needs
        await Bun.write(
            join(targetDir, 'package.json'),
            generatePackageJson(options.name, lang)
        );
        if (lang === 'js') {
            await Bun.write(
                join(targetDir, 'jsconfig.json'),
                generateJsConfig()
            );
        } else {
            await Bun.write(
                join(targetDir, 'tsconfig.json'),
                generateTsConfig()
            );
        }
        await Bun.write(join(targetDir, '.gitignore'), generateGitIgnore());
        await Bun.write(
            join(targetDir, '.prettierrc'),
            generatePrettierConfig()
        );
        await Bun.write(
            join(targetDir, `burger.build.${ext}`),
            generateBurgerConfig(options)
        );

        // Create src directory and index file
        await Bun.write(
            join(targetDir, 'src', `index.${ext}`),
            generateIndexFile(options)
        );

        // Create openapi.config.ts in src/
        await Bun.write(
            join(targetDir, 'src', `openapi.config.${ext}`),
            generateOpenAPIConfig(options)
        );

        await Bun.write(
            join(targetDir, 'src', `hooks.${ext}`),
            generateHooksFile(lang)
        );
        await Bun.write(
            join(targetDir, 'src', `plugins.${ext}`),
            generatePluginsFile(lang)
        );
        await Bun.write(
            join(targetDir, 'src', `providers.${ext}`),
            generateProvidersFile(lang)
        );

        // Create API directory and files if requested
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
                await Bun.write(join(apiDir, name), content);
            }
        }

        // Create Pages directory and files if requested
        if (options.usePages) {
            const pagesDir = join(targetDir, 'src', options.pageDir || 'pages');
            await Bun.write(
                join(pagesDir, 'index.html'),
                generateIndexPage(options)
            );
        }

        // Create sample assets inside pages directory (so they're served by page router)
        if (options.usePages) {
            const pagesDir = join(targetDir, 'src', options.pageDir || 'pages');
            await Bun.write(
                join(pagesDir, 'assets', 'css', 'style.css'),
                generateSampleCss()
            );
            await Bun.write(
                join(pagesDir, 'assets', 'js', 'app.js'),
                generateSampleJs()
            );
            // Logo is loaded from https://burger-api.com/img/logo.png
        }

        // Create ecosystem/hooks directory for installed hooks
        const ecosystemHooksDir = join(targetDir, 'ecosystem', 'hooks');
        await Bun.write(
            join(ecosystemHooksDir, `index.${ext}`),
            generateHooksIndex(lang)
        );

        // Download AI agent skills if requested
        if (options.addSkills) {
            const skillTarget = join(
                targetDir,
                '.agents',
                'skills',
                'burger-api'
            );
            try {
                await downloadSkill('burger-api', skillTarget);
            } catch (err) {
                console.warn(
                    `Warning: Could not download AI agent skills: ${err instanceof Error ? err.message : 'Unknown error'}`
                );
            }
        }

        spin.stop('Project created successfully!');
    } catch (err) {
        spin.stop('Failed to create project', true);
        throw err;
    }
}

/**
 * Install dependencies in a project directory
 * Runs `bun install` to install all packages
 *
 * @param projectDir - Directory containing package.json
 */
export async function installDependencies(projectDir: string): Promise<void> {
    const spin = spinner('Installing dependencies...');

    try {
        // Run bun install using Bun.spawn
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

    if (lang === 'js') {
        files['route.js'] = [
            '/**',
            ' * GET /{your-route}',
            ' * @param {import(\'burger-api\').BurgerContext} ctx',
            ' * @returns {Promise<Response>}',
            ' */',
            'export async function GET(ctx) {',
            ' return Response.json({ ok: true });',
            '}',
            '',
        ].join('\n');
    } else {
        files['route.ts'] = [
            "import type { BurgerContext } from 'burger-api';",
            '',
            'export async function GET(ctx: BurgerContext): Promise<Response> {',
            ' return Response.json({ ok: true });',
            '}',
            '',
        ].join('\n');
    }

    if (options.schema !== false) {
        if (lang === 'js') {
            files['schema.js'] = [
                "import { z } from 'zod/v4';",
                '',
                "/** @type {import('burger-api').MethodSchema} */",
                'export const GET = {',
                ' query: z.object({}),',
                '};',
                '',
            ].join('\n');
        } else {
            files['schema.ts'] = [
                "import { z } from 'zod/v4';",
                "import type { MethodSchema } from 'burger-api';",
                '',
                'export const GET = {',
                ' query: z.object({}),',
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
                ` summary: ${JSON.stringify(`${routeName} endpoint`)},`,
                ` tags: [${JSON.stringify(routeName)}],`,
                `};`,
                '',
            ].join('\n');
        } else {
            files['openapi.ts'] = [
                "import type { OpenAPIMeta } from 'burger-api';",
                '',
                `export const GET = {`,
                ` summary: ${JSON.stringify(`${routeName} endpoint`)},`,
                ` tags: [${JSON.stringify(routeName)}],`,
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
 * Generate a hook factory template for `burger-api generate hook <name>`.
 */
export function generateHookTemplate(
    hookName: string,
    lang: 'ts' | 'js' = 'ts'
): string {
    if (lang === 'js') {
        return [
            `/**`,
            ` * ${hookName} hook factory.`,
            ` * Import and register in src/hooks.js.`,
            ` */`,
            `export function ${hookName}() {`,
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
    // The name doubles as a JS identifier — sanitize so arbitrary plugin
    // names (spaces, quotes, dashes) still produce parseable code.
    const className = (
        pluginName.charAt(0).toUpperCase() + pluginName.slice(1)
    ).replace(/[^a-zA-Z0-9_$]/g, '_');
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
            '/**',
            ' * @param {import(\'burger-api\').BurgerWS} ws',
            ' */',
            'export function open(ws) {',
            ' // Handle new connection',
            ' ws.send(JSON.stringify({ type: "connected" }));',
            '}',
            '',
            'export function message(ws, message) {',
            ' // Handle incoming message',
            ' // ws.send(message); // echo back',
            '}',
            '',
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
            ' // Handle incoming message',
            ' // ws.send(message); // echo back',
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
                '/**',
                ' * @param {import(\'burger-api\').BurgerWS} ws',
                ' */',
                'export function onOpen(ws) {',
                ' // Runs before open handler',
                '}',
                '',
                'export function onMessage(ws, message) {',
                ' // Runs before message handler',
                '}',
                '',
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
                ' maxPayloadLength: 1024 * 1024, // 1MB',
                ' idleTimeout: 30,',
                '};',
                '',
            ].join('\n');
        } else {
            files['config.ts'] = [
                "import type { WebSocketConfig } from 'burger-api';",
                '',
                'export default {',
                ' maxPayloadLength: 1024 * 1024, // 1MB',
                ' idleTimeout: 30,',
                '} satisfies WebSocketConfig;',
                '',
            ].join('\n');
        }
    }

    return files;
}
