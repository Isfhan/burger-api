import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Ecosystem Plugins Example',
    description: 'Demonstrates official plugins from ecosystem/plugins/.',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
