import { Burger } from 'burger-api';

const app = new Burger({
 apiDir: './src/api',
});

const port = Number(process.env.PORT) || 4000;
app.serve(port, () => {
 console.log(`Server running on http://localhost:${port}`);
});