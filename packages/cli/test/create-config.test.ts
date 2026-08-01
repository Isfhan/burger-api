import { describe, it, expect } from 'bun:test';
import {
    generateBurgerConfig,
    generatePackageJson,
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
    });

    it('includes burger-api dependency', () => {
        const content = generatePackageJson('my-project');
        const pkg = JSON.parse(content);

        expect(pkg.dependencies['burger-api']).toBeDefined();
    });
});
