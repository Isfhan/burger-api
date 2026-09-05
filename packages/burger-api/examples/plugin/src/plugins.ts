import type { PluginRegistrar, Plugin } from 'burger-api';

const auditLogger: Plugin = {
    name: 'audit-logger',
    hooks: {
        beforeRoute: [
            (ctx) => {
                const url = new URL(ctx.url);
                console.log(`[audit] ${ctx.method} ${url.pathname}`);
            },
        ],
        transform: {
            auditTimestamp: () => Date.now(),
        },
    },
};

export default (burger: PluginRegistrar) => {
    burger.usePlugin(auditLogger);
};
