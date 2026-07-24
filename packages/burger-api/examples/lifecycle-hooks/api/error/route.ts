import type { BurgerRequest } from '../../../../src/index';

export function GET(_req: BurgerRequest) {
    throw new Error('handler-error');
}
