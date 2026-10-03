import type { BurgerContext } from 'burger-api';

// A beforeRoute hook that returns a Response short-circuits the whole
// pipeline — the route handler must NOT run.
export const beforeRoute = () => new Response('blocked', { status: 403 });
