import type { BurgerRequest } from '../../../src/types/index';

export async function GET(req: BurgerRequest) {
    const ts = (req as any).auditTimestamp;
    return Response.json({
        message: 'Hello from plugin-usage example!',
        auditTimestamp: typeof ts === 'number' ? ts : null,
    });
}
