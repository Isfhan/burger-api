import { Burger, setDir } from '../../src/index';
import type { Plugin } from '../../src/plugin/types';

const auditLogger: Plugin = {
    name: 'audit-logger',
    hooks: {
        beforeHandle: [
            (req) => {
                const url = new URL(req.url);
                console.log(`[audit] ${req.method} ${url.pathname}`);
            },
        ],
        provide: {
            auditTimestamp: () => Date.now(),
        },
    },
};

const burger = new Burger({
    title: 'Plugin Usage Example',
    description: 'Demonstrates registering a plugin with beforeHandle hooks and provide values.',
    apiDir: setDir(__dirname, 'api'),
});

burger.use(auditLogger);

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
