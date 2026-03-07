import { Burger, setDir, type Middleware } from '../../../../../burger-api/src/index';

const globalMiddleware: Middleware[] = [
    () =>
        new Response('blocked by global middleware', {
            status: 418,
        }),
];

const app = new Burger({
    apiDir: setDir(__dirname, 'api'),
    globalMiddleware,
    title: 'Preserve Options Test',
    description: 'Ensures build keeps Burger constructor options.',
    version: '9.9.9',
    hostname: '127.0.0.1',
});

const port = Number(process.env.PORT) || 4000;
app.serve(port, () => {
    console.log(`Fixture server running on http://127.0.0.1:${port}`);
});
