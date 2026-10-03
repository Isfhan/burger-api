import type { BurgerWS } from '../../../../../../../burger-api/src/index';

export function open(ws: BurgerWS) {
    ws.send(JSON.stringify({ type: 'connected' }));
}

export function message(ws: BurgerWS, message: string | Buffer) {
    ws.send(JSON.stringify({ type: 'echo', data: message.toString() }));
}
