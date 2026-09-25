import type { BurgerContext } from 'burger-api';
import { NotFoundError } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const db = (ctx.services as any).db;
    const logger = (ctx.services as any).logger;
    const id = Number(ctx.params?.id);
    logger.info(`Fetching user ${id}`);
    const user = db.users.find((u: any) => u.id === id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    return Response.json({ user });
}
