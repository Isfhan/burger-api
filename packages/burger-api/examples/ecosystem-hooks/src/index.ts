import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Ecosystem Hooks Example',
    description: 'Catalog of all 10 official lifecycle hooks.',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
