import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'File-Based Routing',
    description: 'Dynamic params, groups, and sub-routes',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
    debug: true,
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
