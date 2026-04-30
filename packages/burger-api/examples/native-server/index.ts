// Import burger
import { Burger, setDir } from '../../src/index';

// One minimal route so Bun.serve starts (see api/ping/route.ts).
const burger = new Burger({
    title: 'Burger API',
    description: 'A simple API for serving your data',
    apiDir: setDir(__dirname, 'api'),
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port, () => {
    console.log(`✨ Server is running on port: ${port}`);
});
