import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Build Config Example',
    description: 'Demonstrates burger.build.ts for CLI/AOT production builds.',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
