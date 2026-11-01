import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Plugin Usage Example',
    description: 'Demonstrates registering a plugin with beforeRoute hooks and transform values.',
    apiDir: setDir(__dirname, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
