// Wildcard Routes Example
import { Burger, setDir } from '../../src/index';

// Create a new burger instance with wildcard routing
const burger = new Burger({
    title: 'BurgerAPI with Wildcard Routes',
    description: 'Demonstrating wildcard routes using [...] syntax',
    apiDir: setDir(__dirname, 'api'),
    debug: true, // Enable debug for better error messages
});

// Start the server
const port = Number(process.env.PORT) || 4000;
burger.serve(port);
