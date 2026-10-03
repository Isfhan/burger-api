import type { BurgerContext } from 'burger-api';

export const beforeRoute = (ctx: BurgerContext) => {
    const r = ctx as unknown as { hookRan: string };
    r.hookRan = 'before';
    return undefined;
};

export const onError = (error: Error) =>
    new Response(
        JSON.stringify({ handled: 'route', message: error.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
