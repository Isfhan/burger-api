import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Basic BurgerAPI App',
    description: 'Minimal app with a single route',
    apiDir: setDir(__dirname, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
