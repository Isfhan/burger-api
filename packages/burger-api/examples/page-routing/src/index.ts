import { Burger, setDir } from 'burger-api';

const burger = new Burger({
    title: 'Page Routing Example',
    pageDir: setDir(__dirname, 'pages'),
    pagePrefix: '/',
    debug: true,
});

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
