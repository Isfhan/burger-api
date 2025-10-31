import { Burger, setDir } from '../../src/index';

// Simple test example for nested dynamic routes with Zod validation
const burger = new Burger({
    title: 'Nested Dynamic Routes Test',
    description: 'Testing nested dynamic routes functionality with Zod schemas',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
    debug: true,
});

burger.serve(4000);
