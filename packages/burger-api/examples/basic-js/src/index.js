import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Basic BurgerAPI App (JavaScript)',
    description: 'Minimal app with a single .js route',
    apiDir: setDir(import.meta.dir, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
