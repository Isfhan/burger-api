import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const db = (ctx.services as any).db;
    const logger = (ctx.services as any).logger;
    logger.info('Fetching all users');
    return Response.json({ users: db.users });
}
