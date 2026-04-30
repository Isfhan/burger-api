import type { BurgerRequest } from '../../../../src/types/index';

/** Used only by timeout middleware smoke test. */
export async function GET(_req: BurgerRequest) {
    await new Promise((r) => setTimeout(r, 250));
    return Response.json({ slow: true });
}
