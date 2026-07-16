// Import burger
import { Burger, setDir } from '../../src/index';

// Create a new burger instance
const burger = new Burger({
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: '/api',
});

// Start the server
const port = Number(process.env.PORT) || 4000;
burger.serve(port);
