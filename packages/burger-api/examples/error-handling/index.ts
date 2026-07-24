// Import stuff from burger-api
import { Burger, setDir } from '../../src/index';

// Import middleware


// Create a new Burger instance with OpenAPI metadata and global middleware.
const burger = new Burger({
    title: 'Demo API',
    description:
        'This is a demo API demonstrating all available options in burger-api.',
    apiDir: setDir(__dirname, 'api'),
    version: '1.0.0',
    debug: true,
});

// Start the server on the requested port (or 4000 by default).
const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});
