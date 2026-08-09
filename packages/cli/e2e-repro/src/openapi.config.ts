import type { OpenAPIConfig } from 'burger-api';

export default {
 title: 'e2e-repro',
 description: 'e2e-repro documentation',
 version: '1.0.0',

 servers: [
 { url: "http://localhost:4000", description: "Development" },
 ],

 // Uncomment to protect docs with basic auth:
 // docsAuth: { username: "admin", password: "changeme" },

 // Uncomment to use Scalar instead of Swagger UI:
 // import { scalarDocs } from 'burger-api';
 // provider: scalarDocs(),

 // Uncomment to add JSON Schema conversion for custom validation libraries:
 // mapJsonSchema: { date: (schema) => ({ type: "string", format: "date-time" }) },
} satisfies OpenAPIConfig;
