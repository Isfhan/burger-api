import type { OpenAPIConfig } from 'burger-api';
import { scalarDocs } from 'burger-api';

// Docs auth reads from the environment — never hardcode credentials.
// Set DOCS_USERNAME / DOCS_PASSWORD to protect /docs. Without them the
// docs UI is served unauthenticated (local development).
const docsUsername = process.env.DOCS_USERNAME;
const docsPassword = process.env.DOCS_PASSWORD;

const config: OpenAPIConfig = {
    title: 'Product API',
    version: '1.0.0',
    description: 'A demo API with OpenAPI config convention file',
    servers: [
        { url: 'http://localhost:4000', description: 'Local dev' },
    ],
    contact: {
        name: 'API Support',
        email: 'support@example.com',
    },
    docsPath: '/docs',
    provider: scalarDocs(),
    ...(docsUsername !== undefined && docsPassword !== undefined
        ? { docsAuth: { username: docsUsername, password: docsPassword } }
        : {}),
};

export default config;
