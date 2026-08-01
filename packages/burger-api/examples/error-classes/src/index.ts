import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Error Classes Example',
    description: 'Demonstrates HTTP error classes: NotFoundError, UnauthorizedError, ForbiddenError, MethodNotAllowedError.',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
