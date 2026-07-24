import type { BurgerContext } from '../../../src/context/context';

/**
 * Minimal JSON route for middleware smoke tests.
 * Large payload optional for compression middleware checks.
 */
export async function GET(req: BurgerContext) {
    const url = new URL(req.url);
    if (url.searchParams.get('large') === '1') {
        const payload = 'x'.repeat(2500);
        return Response.json({ ok: true, payload });
    }
    return Response.json({ ok: true, route: 'api' });
}

export async function POST(_req: BurgerContext) {
    return Response.json({ ok: true, method: 'POST' });
}
