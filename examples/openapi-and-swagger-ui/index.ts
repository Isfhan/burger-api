// Import stuff from burger-api
import { Burger, setDir } from '@src';

// Import middleware
import { globalLogger } from './middleware/logger';

// Create a new Burger instance with OpenAPI metadata and global middleware.
const burger = new Burger({
    title: 'Demo API',
    description:
        'This is a demo API demonstrating all available options in burger-api.',
    apiDir: setDir(__dirname, 'api'),
    globalMiddleware: [globalLogger],
    version: '1.0.0',
    debug: true,
});

// Start the server on port 4000, with a callback to log the startup.
burger.serve(4000, () => {
    console.log(`🚀 Server is running on port 4000`);
}); 
