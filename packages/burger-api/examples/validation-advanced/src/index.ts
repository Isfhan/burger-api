import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Validation Advanced Example',
    description: 'Demonstrates coercion, shared schemas, and response validation',
    apiDir: setDir(__dirname, 'api'),
    validation: {
        coerce: true,
        responseValidation: 'dev',
    },
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`Server is running on port: ${port}`);
});
