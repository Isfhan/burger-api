import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Context Example',
    description: 'Demonstrates all BurgerContext properties.',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
