import type { BurgerRequest } from '../../../src/types/index';

export async function GET(req: BurgerRequest) {
    return Response.json({
        pluginRan: (req as any)._pluginRan === true,
        macroRan: (req as any)._macroRan === true,
        pluginValue: (req as any).pluginValue,
        pluginNumber: (req as any).pluginNumber,
        macroValue: (req as any).macroValue,
    });
}
