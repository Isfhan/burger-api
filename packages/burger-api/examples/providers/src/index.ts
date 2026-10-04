import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Providers Example',
    description: 'Demonstrates service injection via burger.provide() and ctx.services.',
    apiDir: setDir(__dirname, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
