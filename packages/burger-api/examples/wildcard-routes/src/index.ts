import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Wildcard Routes',
    description: '[...] catch-all routes and priority rules',
    apiDir: setDir(__dirname, 'api'),
    debug: true,
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
