import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'CORS App',
    description: 'CORS middleware in the Burger API framework.',
    apiDir: setDir(__dirname, 'api'),
    version: '1.0.0',
    debug: true,
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});
