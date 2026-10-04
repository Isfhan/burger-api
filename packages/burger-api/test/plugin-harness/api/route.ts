import type { BurgerContext } from '../../../src/context/context';

export async function GET(req: BurgerContext) {
    return Response.json({
        pluginRan: (req as any)._pluginRan === true,
        pluginValue: (req as any).pluginValue,
        pluginNumber: (req as any).pluginNumber,
    });
}
