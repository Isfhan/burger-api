import { Burger, setDir } from '../../../src/index';

const app = new Burger({
    apiDir: setDir(__dirname, 'api'),
    pageDir: setDir(__dirname, 'pages'),
    debug: true,
});

const port = Number(process.env.PORT) || 4000;
app.serve(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
