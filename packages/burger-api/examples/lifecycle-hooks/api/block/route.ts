import type { BurgerRequest } from '../../../../src/index';

export function GET(_req: BurgerRequest) {
    return Response.json({ ok: true });
}
