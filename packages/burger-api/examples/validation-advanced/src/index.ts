import { Burger, setDir } from 'burger-api';
import { z } from 'zod';

const burger = new Burger({
    title: 'Validation Advanced Example',
    description: 'Demonstrates coercion, named models, and response validation',
    apiDir: setDir(__dirname, 'api'),
    models: {
        PaginationQuery: z.object({
            page: z.number().int().positive().default(1),
            limit: z.number().int().min(1).max(100).default(10),
        }),
        Item: z.object({
            id: z.number(),
            name: z.string(),
            price: z.number(),
        }),
    },
    validation: {
        coerce: true,
        responseValidation: 'dev',
    },
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`Server is running on port: ${port}`);
});
