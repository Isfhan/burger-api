import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext): Promise<Response> {
 return Response.json({ ok: true });
}
