import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'OpenAPI Config Example',
    description: 'Demonstrates openapi.config.ts with docs auth and custom metadata.',
    apiDir: setDir(__dirname, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
