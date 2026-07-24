import type { BurgerContext } from '../../../../src/context/context';

/** Used only by timeout middleware smoke test. */
export async function GET(_req: BurgerContext) {
    await new Promise((r) => setTimeout(r, 250));
    return Response.json({ slow: true });
}
