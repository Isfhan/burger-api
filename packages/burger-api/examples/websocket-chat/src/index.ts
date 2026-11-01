import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    apiDir: setDir(__dirname, 'api'),
    wsDir: setDir(__dirname, 'websocket'),
    debug: true,
});

const port = Number(process.env.PORT) || 3000;
burger.serve(port, () => {
    console.log(`WebSocket chat server running at http://localhost:${port}`);
    console.log(`Connect via WebSocket to ws://localhost:${port}/chat`);
    console.log('Services available: logger, db');
});
