import { Burger, setDir } from '../../../src/index';
import type { Plugin } from '../../../src/plugin/types';
import { join } from 'path';

const port = Number(process.env.PORT) || 4000;

const testPlugin: Plugin = {
    name: 'test-plugin',
    hooks: {
        beforeRoute: [
            (req: any) => {
                (req as any)._pluginRan = true;
            },
        ],
        transform: {
            pluginValue: () => 'from-plugin',
            pluginNumber: () => 42,
        },
    },
};

const burger = new Burger({
    title: 'Plugin Harness',
    description: 'Integration test harness for plugins',
    apiDir: setDir(join(import.meta.dir, '..'), 'api'),
    debug: false,
});

burger.usePlugin(testPlugin);

burger.serve(port);
