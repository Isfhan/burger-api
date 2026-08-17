import { afterEach, describe, it, expect } from 'bun:test';
import {
    generateBurgerConfig,
    generateJsConfig,
    generateHooksIndex,
    generateOpenAPIConfig,
    generatePluginsFile,
    generateProvidersFile,
    generateRouteFiles,
    generateTsConfig,
    generatePackageJson,
    generatePluginTemplate,
} from '../src/utils/templates';
import type { CreateOptions } from '../src/types';

describe('generateBurgerConfig', () => {
    it('generates config with default-like values', () => {
        const options: CreateOptions = {
            name: 'my-api',
            useApi: true,
            apiDir: 'api',
            apiPrefix: '/api',
            debug: false,
            usePages: true,
            pageDir: 'pages',
            pagePrefix: '/',
        };

        const content = generateBurgerConfig(options);

        expect(content).toContain('apiDir: "./src/api"');
        expect(content).toContain('pageDir: "./src/pages"');
        expect(content).toContain('apiPrefix: "/api"');
        expect(content).toContain('pagePrefix: "/"');
        expect(content).toContain('debug: false');
    });

    it('types the TS config with satisfies BuildConfig', () => {
        const content = generateBurgerConfig({
            name: 'x',
            useApi: true,
            apiDir: 'api',
            apiPrefix: '/api',
            debug: false,
            usePages: true,
            pageDir: 'pages',
            pagePrefix: '/',
            lang: 'ts',
        } as CreateOptions);

        expect(content).toContain(
            "import type { BuildConfig } from 'burger-api';"
        );
        expect(content).toContain('} satisfies BuildConfig;');
    });

    it('types the JS config with a JSDoc BuildConfig hint', () => {
        const content = generateBurgerConfig({
            name: 'x',
            useApi: true,
            apiDir: 'api',
            apiPrefix: '/api',
            debug: false,
            usePages: true,
            pageDir: 'pages',
            pagePrefix: '/',
            lang: 'js',
        } as CreateOptions);

        expect(content).toContain(
            "/** @type {import('burger-api').BuildConfig} */"
        );
    });

    it('generates config with custom values from prompts', () => {
        const options: CreateOptions = {
            name: 'custom-app',
            useApi: true,
            apiDir: 'backend',
            apiPrefix: '/v1',
            debug: true,
            usePages: true,
            pageDir: 'site',
            pagePrefix: '/web',
        };

        const content = generateBurgerConfig(options);

        expect(content).toContain('apiDir: "./src/backend"');
        expect(content).toContain('pageDir: "./src/site"');
        expect(content).toContain('apiPrefix: "/v1"');
        expect(content).toContain('pagePrefix: "/web"');
        expect(content).toContain('debug: true');
    });
});

describe('generatePackageJson', () => {
    it('generates package.json with vision-aligned CLI scripts', () => {
        const content = generatePackageJson('my-project');
        const pkg = JSON.parse(content);

        expect(pkg.scripts.dev).toBe('burger-api dev');
        expect(pkg.scripts.start).toBe('burger-api start');
        expect(pkg.scripts.build).toBe('burger-api build src/index.ts');
        expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    });

    it('includes burger-api dependency', () => {
        const content = generatePackageJson('my-project');
        const pkg = JSON.parse(content);

        expect(pkg.dependencies['burger-api']).toBeDefined();
    });

    it('generates .js entry scripts for JS projects', () => {
        const pkg = JSON.parse(generatePackageJson('my-project', 'js'));

        expect(pkg.scripts.dev).toBe('burger-api dev -f src/index.js');
        expect(pkg.scripts.start).toBe('burger-api start -f src/index.js');
        expect(pkg.scripts.build).toBe('burger-api build src/index.js');
        // Plain `tsc` ignores jsconfig.json — JS apps check via -p.
        expect(pkg.scripts.typecheck).toBe('tsc -p jsconfig.json --noEmit');
    });
});

describe('generatePackageJson BURGER_API_SOURCE', () => {
    const original = process.env.BURGER_API_SOURCE;

    afterEach(() => {
        if (original === undefined) delete process.env.BURGER_API_SOURCE;
        else process.env.BURGER_API_SOURCE = original;
    });

    it('keeps the npm range when the env var is unset', () => {
        delete process.env.BURGER_API_SOURCE;
        const pkg = JSON.parse(generatePackageJson('x'));
        expect(pkg.dependencies['burger-api']).toBe('^1.0.0');
    });

    it('emits link:burger-api when set to "link"', () => {
        process.env.BURGER_API_SOURCE = 'link';
        const pkg = JSON.parse(generatePackageJson('x'));
        expect(pkg.dependencies['burger-api']).toBe('link:burger-api');
    });

    it('emits link:burger-api when set to "LINK" (case-insensitive)', () => {
        process.env.BURGER_API_SOURCE = 'LINK';
        const pkg = JSON.parse(generatePackageJson('x'));
        expect(pkg.dependencies['burger-api']).toBe('link:burger-api');
    });

    it('emits a file: specifier with an absolute path when set to a path', () => {
        process.env.BURGER_API_SOURCE = 'C:\\repos\\burger-api';
        const pkg = JSON.parse(generatePackageJson('x'));
        expect(pkg.dependencies['burger-api']).toBe(
            'file:C:\\repos\\burger-api'
        );
    });
});

describe('JS scaffold (--lang js)', () => {
    const jsOptions: CreateOptions = {
        name: 'my-api',
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        pageDir: 'pages',
        pagePrefix: '/',
        lang: 'js',
    };

    it('generateJsConfig enables checkJs and strict JSDoc checking', () => {
        const config = JSON.parse(generateJsConfig());

        expect(config.compilerOptions.checkJs).toBe(true);
        expect(config.compilerOptions.strict).toBe(true);
        expect(config.compilerOptions.noEmit).toBe(true);
        expect(config.include).toContain('src');
    });

    it('generateRouteFiles emits .js files with JSDoc types for JS', () => {
        const files = generateRouteFiles('hello', {}, 'js');

        expect(Object.keys(files).sort()).toEqual([
            'config.js',
            'hooks.js',
            'openapi.js',
            'route.js',
            'schema.js',
        ]);
        expect(files['route.js']).toContain(
            "@param {import('burger-api').BurgerContext} ctx"
        );
        expect(files['route.js']).not.toContain(': BurgerContext');
        expect(files['hooks.js']).toContain(
            "@param {import('burger-api').BurgerContext} ctx"
        );
    });

    it('generateRouteFiles keeps .ts files with types for TS', () => {
        const files = generateRouteFiles('hello', {}, 'ts');

        expect(files['route.ts']).toContain(
            'export async function GET(ctx: BurgerContext): Promise<Response>'
        );
        expect(files['route.js']).toBeUndefined();
    });

    it('generateRouteFiles stamps consumer types (satisfies) on TS convention files', () => {
        const files = generateRouteFiles('hello', {}, 'ts');

        expect(files['schema.ts']).toContain(
            "import type { MethodSchema } from 'burger-api';"
        );
        expect(files['schema.ts']).toContain('} satisfies MethodSchema;');
        expect(files['openapi.ts']).toContain(
            "import type { OpenAPIMeta } from 'burger-api';"
        );
        expect(files['openapi.ts']).toContain('} satisfies OpenAPIMeta;');
        expect(files['config.ts']).toContain(
            "import type { RouteConfig } from 'burger-api';"
        );
        expect(files['config.ts']).toContain('} satisfies RouteConfig;');
    });

    it('generateRouteFiles adds JSDoc consumer-type hints on JS convention files', () => {
        const files = generateRouteFiles('hello', {}, 'js');

        expect(files['schema.js']).toContain(
            "/** @type {import('burger-api').MethodSchema} */"
        );
        expect(files['openapi.js']).toContain(
            "/** @type {import('burger-api').OpenAPIMeta} */"
        );
        expect(files['config.js']).toContain(
            "/** @type {import('burger-api').RouteConfig} */"
        );
    });

    it('generateOpenAPIConfig omits type-only imports for JS', () => {
        const js = generateOpenAPIConfig(jsOptions);
        const ts = generateOpenAPIConfig({ ...jsOptions, lang: 'ts' });

        expect(js).not.toContain("import type { OpenAPIConfig }");
        expect(js).not.toContain('satisfies OpenAPIConfig');
        expect(ts).toContain("import type { OpenAPIConfig }");
        expect(ts).toContain('satisfies OpenAPIConfig;');
    });

    it('generateOpenAPIConfig points the dev server at localhost:4000', () => {
        const config = generateOpenAPIConfig(jsOptions);

        expect(config).toContain('http://localhost:4000');
        expect(config).not.toContain('localhost:3000');
    });

    it('generatePluginsFile/generateProvidersFile are type-free for JS', () => {
        expect(generatePluginsFile('js')).not.toContain('import type');
        expect(generatePluginsFile('js')).toContain('export default (burger) =>');
        expect(generateProvidersFile('js')).not.toContain('import type');
        expect(generateProvidersFile('ts')).toContain(
            "import type { Burger } from 'burger-api';"
        );
    });

    it('generateHooksIndex drops TS-only annotations for JS', () => {
        expect(generateHooksIndex('js')).not.toContain(': unknown[]');
        expect(generateHooksIndex('ts')).toContain(': unknown[]');
    });

    it('generateTsConfig still emits for TS projects', () => {
        const config = JSON.parse(generateTsConfig());

        expect(config.compilerOptions.strict).toBe(true);
        expect(config.compilerOptions.types).toEqual(['bun']);
    });
});

describe('Scaffold typecheck hardening (U15)', () => {
    const transpile = async (source: string): Promise<void> => {
        new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
    };

    it('emits types: ["bun"] (matches the installed @types/bun)', () => {
        const config = JSON.parse(generateTsConfig());
        expect(config.compilerOptions.types).toEqual(['bun']);
    });

    it('project name with a quote still generates parseable openapi.config.ts', async () => {
        const content = generateOpenAPIConfig({
            name: "Bob's API",
            lang: 'ts',
        } as CreateOptions);
        expect(content).toContain('"Bob\'s API"');
        await transpile(content);
    });

    it('openapi.config.ts without a name falls back to a safe default', async () => {
        const content = generateOpenAPIConfig({ lang: 'ts' } as CreateOptions);
        await transpile(content);
        expect(content).toContain('"Burger API"');
    });

    it('route files with a quoted route name still parse', async () => {
        const files = generateRouteFiles("Bob's", {}, 'ts');
        await transpile(files['openapi.ts']!);
        await transpile(files['route.ts']!);
        expect(files['openapi.ts']).toContain('"Bob\'s"');
    });

    it('burger config with quoted prefixes still parses', async () => {
        const content = generateBurgerConfig({
            name: 'x',
            useApi: true,
            apiDir: 'api',
            apiPrefix: "/api-'s",
            debug: false,
            usePages: true,
            pageDir: 'pages',
            pagePrefix: "/p-'s",
        } as CreateOptions);
        await transpile(content);
    });

    it('plugin template with a quoted name still parses', async () => {
        await transpile(generatePluginTemplate("O'Brien's", 'ts'));
    });
});
