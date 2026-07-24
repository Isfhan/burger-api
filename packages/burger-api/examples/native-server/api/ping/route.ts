import type { BurgerContext } from '../../../../src/index';

/** Minimal route so the dev server stays up (Burger requires at least one route to listen). */
export async function GET(_ctx: BurgerContext) {
    return Response.json({ ping: 'ok' });
}
