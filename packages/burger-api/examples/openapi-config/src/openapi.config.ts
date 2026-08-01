import type { OpenAPIConfig } from 'burger-api';
import { scalarDocs } from 'burger-api';

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
    docsAuth: {
        username: 'admin',
        password: 'secret',
    },
};

export default config;
