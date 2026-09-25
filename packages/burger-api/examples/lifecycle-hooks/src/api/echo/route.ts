import type { BurgerContext } from 'burger-api';

export function GET(ctx: BurgerContext) {
    const r = ctx as unknown as { order: string[]; hookRan: string };
    return Response.json({ order: r.order ?? [], hookRan: r.hookRan ?? null });
}
