// Import burger
import { Burger } from '../../src/index';

// Create a new burger instance
const burger = new Burger({
    title: 'Burger API',
    description: 'A simple API for serving your data',
});

// Start the server
burger.serve(4000, () => {
    console.log(`✨ Server is running on port: 4000`);
});
