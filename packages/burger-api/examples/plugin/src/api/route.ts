import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const ts = (ctx as any).auditTimestamp;
    return Response.json({
        message: 'Hello from plugin example!',
        auditTimestamp: typeof ts === 'number' ? ts : null,
    });
}
