import type { BurgerContext } from '../../../../src/index';

// A beforeRoute hook that returns a Response short-circuits the whole
// pipeline — the route handler must NOT run.
export const beforeRoute = () => new Response('blocked', { status: 403 });
