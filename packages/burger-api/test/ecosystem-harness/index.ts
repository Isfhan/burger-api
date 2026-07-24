/**
 * Spawned by ecosystem-middleware-smoke tests. Select middleware via TEST_MW.
 * The selected middleware runs as a global beforeHandle hook via api/hooks.ts.
 */
import { Burger, setDir } from '../../src/index';

const port = Number(process.env.PORT) || 4000;

const burger = new Burger({
    title: 'Ecosystem harness',
    description: 'Middleware smoke tests',
    apiDir: setDir(import.meta.dir, 'api'),
    debug: false,
});

burger.serve(port);
