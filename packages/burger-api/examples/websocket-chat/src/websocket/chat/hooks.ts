import type { BurgerWS } from 'burger-api';

export function onOpen(ws: BurgerWS) {
    console.log('[Chat Hook] New connection opened');
}

export function onMessage(ws: BurgerWS, message: string | Buffer) {
    // Log message length for debugging
    const msgStr = message.toString();
    console.log(`[Chat Hook] Message from ${ws.data.userId}: ${msgStr.length} bytes`);
}

export function onClose(ws: BurgerWS, code: number, reason: string) {
    console.log(`[Chat Hook] Connection closed: ${code} ${reason}`);
}
