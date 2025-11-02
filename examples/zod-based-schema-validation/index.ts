// Import burger
import { Burger, setDir } from '../../src/index';
import { globalMiddleware1 } from './middleware';

// Create a new burger instance
const burger = new Burger({
    title: 'Burger API',
    description: 'A simple API for serving your data',
    apiDir: setDir(__dirname, 'api'),
    globalMiddleware: [globalMiddleware1],
});

// Start the server
burger.serve(4000, () => {
    console.log(`✨ Server is running on port: 4000`);
});
