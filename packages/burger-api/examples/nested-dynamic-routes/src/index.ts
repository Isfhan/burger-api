import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Nested Dynamic Routes',
    description: 'Deeply nested [userId]/[postId] params',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
    debug: true,
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
