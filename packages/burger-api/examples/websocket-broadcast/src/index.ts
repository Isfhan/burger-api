import { Burger } from 'burger-api';

const burger = new Burger({
    wsDir: './src/websocket',
    debug: true,
});

burger.serve(3001, () => {
    console.log('WebSocket broadcast server running at http://localhost:3001');
    console.log('Connect via WebSocket to ws://localhost:3001/notify');
});
