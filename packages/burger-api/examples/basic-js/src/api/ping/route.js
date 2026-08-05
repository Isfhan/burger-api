/**
 * GET /api/ping
 * @param {import('burger-api').BurgerContext} ctx
 * @returns {Promise<Response>}
 */
export async function GET(ctx) {
    return Response.json({ ping: 'ok' });
}
