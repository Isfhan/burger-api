import { Burger, setDir } from '../../src/index';
import type { Plugin, RouteHooks } from '../../src/plugin/types';

const port = Number(process.env.PORT) || 4000;

const testPlugin: Plugin = {
    name: 'test-plugin',
    hooks: {
        beforeHandle: [
            (req) => {
                (req as any)._pluginRan = true;
            },
        ],
        provide: {
            pluginValue: () => 'from-plugin',
            pluginNumber: () => 42,
        },
    },
};

const testMacro: RouteHooks = {
    beforeHandle: [
        (req) => {
            (req as any)._macroRan = true;
        },
    ],
    provide: {
        macroValue: () => 'from-macro',
    },
};

const burger = new Burger({
    title: 'Plugin Macro Harness',
    description: 'Integration test harness for plugins and macros',
    apiDir: setDir(import.meta.dir, 'api'),
    debug: false,
});

burger.use(testPlugin);
burger.macro('test-macro', () => testMacro);

burger.serve(port);
