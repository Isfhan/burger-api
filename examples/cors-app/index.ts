// Import stuff from burger-api
import { Burger, setDir } from '../../src/index';

// Import middleware
import { cors } from '../../ecosystem/middlewares/cors/cors';

// Create Burger instance
const burger = new Burger({
    title: 'CORS App',
    description: 'CORS middleware in the Burger API framework.',
    apiDir: setDir(__dirname, 'api'),
    globalMiddleware: [
        cors({
            origin: ['http://localhost:3000'], // Allow only requests from http://localhost:3000
            debug: true,
        }),
    ],
    version: '1.0.0',
    debug: true,
});

// Start the server on port 4000
burger.serve(4000, () => {
    console.log(`🚀 Server is running on port 4000`);
});
