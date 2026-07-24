import type { BurgerRequest } from '../../../../src/index';

export function GET(req: BurgerRequest) {
    const r = req as unknown as { order: string[]; hookRan: string };
    return Response.json({ order: r.order ?? [], hookRan: r.hookRan ?? null });
}
