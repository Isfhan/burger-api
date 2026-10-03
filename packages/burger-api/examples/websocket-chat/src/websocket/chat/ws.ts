import type { BurgerWS } from 'burger-api';

// Store connected users
const users = new Map<string, BurgerWS>();

export function open(ws: BurgerWS) {
    const userId = `user-${Date.now()}`;
    ws.data.userId = userId;
    users.set(userId, ws);

    // Access injected services via ctx.services
    const logger = (ws.services as any).logger as { info: (msg: string) => void };
    const db = (ws.services as any).db as { getRecentMessages: (limit: number) => Promise<any[]> };

    logger.info(`User connected: ${userId}. Total users: ${users.size}`);

    // Notify all users
    broadcast({
        type: 'system',
        message: `${userId} joined the chat`,
        userCount: users.size,
    });

    // Send welcome message to the new user
    ws.send(JSON.stringify({
        type: 'welcome',
        userId,
        userCount: users.size,
    }));
}

export function message(ws: BurgerWS, message: string | Buffer) {
    const logger = (ws.services as any).logger as { info: (msg: string) => void };
    const db = (ws.services as any).db as { saveMessage: (data: any) => Promise<any> };

    try {
        const data = JSON.parse(message.toString());

        logger.info(`Message from ${ws.data.userId}: ${data.message}`);

        // Save message to database (using injected service)
        db.saveMessage({
            userId: ws.data.userId,
            message: data.message,
            timestamp: Date.now(),
        });

        // Broadcast to all users
        broadcast({
            type: 'message',
            userId: ws.data.userId,
            message: data.message,
            timestamp: Date.now(),
        });
    } catch (error) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format. Send JSON with a "message" field.',
        }));
    }
}

export function close(ws: BurgerWS, code: number, reason: string) {
    const userId = ws.data.userId as string;
    const logger = (ws.services as any).logger as { info: (msg: string) => void };

    users.delete(userId);

    logger.info(`User disconnected: ${userId}. Total users: ${users.size}`);

    broadcast({
        type: 'system',
        message: `${userId} left the chat`,
        userCount: users.size,
    });
}

function broadcast(data: Record<string, unknown>) {
    const message = JSON.stringify(data);
    for (const user of users.values()) {
        user.send(message);
    }
}
