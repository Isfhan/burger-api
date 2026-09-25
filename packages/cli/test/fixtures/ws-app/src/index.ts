import { Burger } from '../../../../../burger-api/src/index';

const app = new Burger({
    apiDir: 'src/api',
    wsDir: 'src/websocket',
});

const port = Number(process.env.PORT) || 4000;
app.serve(port, () => {
    console.log(`Fixture server running on http://127.0.0.1:${port}`);
});
