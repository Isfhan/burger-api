import { describe, it, expect } from 'bun:test';
import { generateBurgerConfig } from '../src/utils/templates';
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

        expect(content).toContain("apiDir: \"./src/api\"");
        expect(content).toContain("pageDir: \"./src/pages\"");
        expect(content).toContain("apiPrefix: \"/api\"");
        expect(content).toContain("pagePrefix: \"/\"");
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

        expect(content).toContain("apiDir: \"./src/backend\"");
        expect(content).toContain("pageDir: \"./src/site\"");
        expect(content).toContain("apiPrefix: \"/v1\"");
        expect(content).toContain("pagePrefix: \"/web\"");
        expect(content).toContain('debug: true');
    });
});
