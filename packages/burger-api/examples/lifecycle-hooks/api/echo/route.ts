import type { BurgerContext } from '../../../../src/index';

export function GET(ctx: BurgerContext) {
    const r = ctx as unknown as { order: string[]; hookRan: string };
    return Response.json({ order: r.order ?? [], hookRan: r.hookRan ?? null });
}
