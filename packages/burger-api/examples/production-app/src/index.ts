import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Production App',
    description: 'Demonstrates auth, rate limiting, CORS, and OpenAPI.',
    version: '1.0.0',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
    debug: true,
});

const port = Number(process.env.PORT) || 4000;

burger.serve(port, () => {
    console.log(`Production App running on http://localhost:${port}`);
    console.log(`API docs: http://localhost:${port}/docs`);
    console.log(`OpenAPI spec: http://localhost:${port}/openapi.json`);
});
