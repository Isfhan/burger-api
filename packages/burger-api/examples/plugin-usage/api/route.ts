import type { BurgerContext } from '../../../src/index';

export async function GET(ctx: BurgerContext) {
    const ts = (ctx as any).auditTimestamp;
    return Response.json({
        message: 'Hello from plugin-usage example!',
        auditTimestamp: typeof ts === 'number' ? ts : null,
    });
}
