import type { BurgerContext } from '../../../../src/index';

// afterRoute receives the Response and returns a transform function
// `(res) => Response` that reshapes the outgoing body.
export const afterRoute = () => async (res: Response) => {
    const data = (await res.json()) as Record<string, unknown>;
    return Response.json({ ...data, after: true });
};
