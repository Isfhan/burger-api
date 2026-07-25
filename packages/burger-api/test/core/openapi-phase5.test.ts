import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { ModuleLoader } from '../../src/compiler/module-loader';
import { generateOpenAPIDocument } from '../../src/core/openapi';
import { scalarDocs, swaggerDocs, redocDocs } from '../../src/core/docs-providers';
import type { OpenAPIConfig, OpenAPIObject } from '../../src/types/openapi-config';
import type { RouteDefinition } from '../../src/types/index';
import { z } from 'zod';

// ─── Scanner: openapi.config.ts discovery ───

describe('DirectoryScanner — openapi.config.ts discovery', () => {
    it('discovers openapi.config.ts at the app root', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-oapi-'));
        try {
            mkdirSync(path.join(root, 'api', 'users'), { recursive: true });
            writeFileSync(path.join(root, 'api', 'users', 'route.ts'), 'export {};');
            writeFileSync(
                path.join(root, 'openapi.config.ts'),
                'export default { title: "Test API" };'
            );
            const scanner = new DirectoryScanner(path.join(root, 'api'), 'api');
            const result = await scanner.scan();
            expect(result.openAPIConfigPath).toBeDefined();
            expect(result.openAPIConfigPath).toContain('openapi.config.ts');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns undefined openAPIConfigPath when no config exists', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-oapi-'));
        try {
            mkdirSync(path.join(root, 'api', 'users'), { recursive: true });
            writeFileSync(path.join(root, 'api', 'users', 'route.ts'), 'export {};');
            const scanner = new DirectoryScanner(path.join(root, 'api'), 'api');
            const result = await scanner.scan();
            expect(result.openAPIConfigPath).toBeUndefined();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('discovers openapi.config.ts in src/ when apiDir is src/api', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-oapi-'));
        try {
            mkdirSync(path.join(root, 'src', 'api', 'users'), { recursive: true });
            writeFileSync(path.join(root, 'src', 'api', 'users', 'route.ts'), 'export {};');
            writeFileSync(
                path.join(root, 'src', 'openapi.config.ts'),
                'export default { title: "Test API" };'
            );
            const scanner = new DirectoryScanner(path.join(root, 'src', 'api'), 'api');
            const result = await scanner.scan();
            expect(result.openAPIConfigPath).toBeDefined();
            expect(result.openAPIConfigPath).toContain(path.join('src', 'openapi.config.ts'));
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

// ─── ModuleLoader: openapi.config loading ───

describe('ModuleLoader — loadOpenAPIConfig', () => {
    it('loads openapi.config.ts from scanned result', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-oapi-'));
        try {
            mkdirSync(path.join(root, 'api', 'users'), { recursive: true });
            writeFileSync(path.join(root, 'api', 'users', 'route.ts'), 'export default { GET() { return Response.json({}); } };');
            writeFileSync(
                path.join(root, 'openapi.config.ts'),
                'export default { title: "Loaded API", version: "2.0.0" };'
            );
            const scanner = new DirectoryScanner(path.join(root, 'api'), 'api');
            const scanned = await scanner.scan();
            const loader = new ModuleLoader();
            const config = await loader.loadOpenAPIConfig(scanned);
            expect(config).toBeDefined();
            expect(config!.title).toBe('Loaded API');
            expect(config!.version).toBe('2.0.0');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns undefined when no openapi.config.ts exists', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-oapi-'));
        try {
            mkdirSync(path.join(root, 'api', 'users'), { recursive: true });
            writeFileSync(path.join(root, 'api', 'users', 'route.ts'), 'export default { GET() { return Response.json({}); } };');
            const scanner = new DirectoryScanner(path.join(root, 'api'), 'api');
            const scanned = await scanner.scan();
            const loader = new ModuleLoader();
            const config = await loader.loadOpenAPIConfig(scanned);
            expect(config).toBeUndefined();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

// ─── generateOpenAPIDocument — config integration ───

function makeRoute(overrides: Partial<RouteDefinition> & { path: string; handlers: any }): RouteDefinition {
    return {
        schema: {},
        openapi: {},
        ...overrides,
    } as RouteDefinition;
}

describe('generateOpenAPIDocument — config', () => {
    const baseOptions = { title: 'Fallback', version: '1.0.0' } as any;

    it('uses config metadata over ServerOptions', () => {
        const config: OpenAPIConfig = {
            title: 'Config API',
            description: 'From config',
            version: '3.0.0',
        };
        const doc = generateOpenAPIDocument([], baseOptions, config);
        expect(doc.info.title).toBe('Config API');
        expect(doc.info.description).toBe('From config');
        expect(doc.info.version).toBe('3.0.0');
    });

    it('falls back to ServerOptions when config has no metadata', () => {
        const doc = generateOpenAPIDocument([], baseOptions, undefined);
        expect(doc.info.title).toBe('Fallback');
    });

    it('includes servers array from config', () => {
        const config: OpenAPIConfig = {
            servers: [
                { url: 'https://api.example.com', description: 'Production' },
                { url: 'http://localhost:4000', description: 'Dev' },
            ],
        };
        const doc = generateOpenAPIDocument([], baseOptions, config);
        expect(doc.servers).toBeDefined();
        expect(doc.servers).toHaveLength(2);
        expect(doc.servers![0].url).toBe('https://api.example.com');
    });

    it('omits servers when config has none', () => {
        const doc = generateOpenAPIDocument([], baseOptions, undefined);
        expect(doc.servers).toBeUndefined();
    });

    it('includes contact and license from config', () => {
        const config: OpenAPIConfig = {
            contact: { name: 'Team', email: 'api@example.com' },
            license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
            termsOfService: 'https://example.com/tos',
        };
        const doc = generateOpenAPIDocument([], baseOptions, config);
        expect(doc.info.contact).toEqual({ name: 'Team', email: 'api@example.com' });
        expect(doc.info.license).toEqual({ name: 'MIT', url: 'https://opensource.org/licenses/MIT' });
        expect(doc.info.termsOfService).toBe('https://example.com/tos');
    });

    it('includes externalDocs from config', () => {
        const config: OpenAPIConfig = {
            externalDocs: { url: 'https://docs.example.com', description: 'Full docs' },
        };
        const doc = generateOpenAPIDocument([], baseOptions, config);
        expect(doc.externalDocs).toEqual({ url: 'https://docs.example.com', description: 'Full docs' });
    });

    it('collects tags from operations into top-level tags array', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/users',
                handlers: { GET: () => Response.json({}) },
                openapi: { get: { summary: 'List users', tags: ['Users'] } },
            }),
            makeRoute({
                path: '/api/posts',
                handlers: { GET: () => Response.json({}) },
                openapi: { get: { summary: 'List posts', tags: ['Posts'] } },
            }),
            makeRoute({
                path: '/api/admin',
                handlers: { GET: () => Response.json({}) },
                openapi: { get: { summary: 'Admin', tags: ['Users', 'Admin'] } },
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        const tagNames = (doc as any).tags.map((t: any) => t.name).sort();
        expect(tagNames).toEqual(['Admin', 'Posts', 'Users']);
    });

    it('auto-generates response schemas from schema.response', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/items',
                handlers: { GET: () => Response.json({}) },
                schema: {
                    get: {
                        response: {
                            '200': z.object({ items: z.array(z.string()), total: z.number() }),
                        },
                    },
                },
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        const getOp = (doc.paths['/api/items'] as any).get;
        expect(getOp.responses['200']).toBeDefined();
        expect(getOp.responses['200'].description).toBe('Successful response');
        expect(getOp.responses['200'].content['application/json'].schema).toBeDefined();
    });

    it('user-provided responses in openapi.ts override auto-generated ones', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/items',
                handlers: { GET: () => Response.json({}) },
                openapi: {
                    get: {
                        responses: {
                            '200': { description: 'Custom response' },
                            '404': { description: 'Not found' },
                        },
                    },
                },
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        const getOp = (doc.paths['/api/items'] as any).get;
        expect(getOp.responses['200'].description).toBe('Custom response');
        expect(getOp.responses['404']).toBeDefined();
    });
});

// ─── Docs providers ───

describe('Docs providers', () => {
    const mockSpec: OpenAPIObject = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
    };

    describe('scalarDocs', () => {
        it('returns HTML containing Scalar api-reference', () => {
            const provider = scalarDocs();
            const html = provider(mockSpec);
            expect(typeof html).toBe('string');
            expect(html).toContain('api-reference');
            expect(html).toContain('cdn.jsdelivr.net/npm/@scalar/api-reference');
        });

        it('includes the spec title in the HTML', () => {
            const provider = scalarDocs();
            const html = provider(mockSpec);
            expect(html).toContain('Test API');
        });
    });

    describe('swaggerDocs', () => {
        it('returns HTML containing Swagger UI elements', () => {
            const provider = swaggerDocs();
            const html = provider(mockSpec);
            expect(typeof html).toBe('string');
            expect(html).toContain('swagger-ui');
            expect(html).toContain('SwaggerUIBundle');
        });
    });

    describe('redocDocs', () => {
        it('returns HTML containing ReDoc elements', () => {
            const provider = redocDocs();
            const html = provider(mockSpec);
            expect(typeof html).toBe('string');
            expect(html).toContain('redoc');
            expect(html).toContain('redoc.standalone.js');
        });
    });
});
