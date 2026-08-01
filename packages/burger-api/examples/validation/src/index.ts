import { Burger, setDir } from 'burger-api';

// Create a new burger instance
const burger = new Burger({
    title: 'Burger API',
    description: 'A simple API for serving your data',
    apiDir: setDir(__dirname, 'api'),
});

// Start the server
const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`✨ Server is running on port: ${port}`);
});
