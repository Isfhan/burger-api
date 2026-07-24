import { Burger, setDir } from '../../src/index';
const burger = new Burger({
    title: 'Lifecycle Hooks (Phase 4 M1)',
    description: 'Demonstrates beforeHandle / afterHandle / onResponse + middleware equivalence.',
    apiDir: setDir(__dirname, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
