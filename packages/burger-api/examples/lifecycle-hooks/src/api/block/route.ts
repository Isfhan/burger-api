import type { BurgerContext } from 'burger-api';

export function GET(_ctx: BurgerContext) {
    return Response.json({ ok: true });
}
