import type { BurgerWS } from 'burger-api';

// Store connections by topic
const topicSubscribers = new Map<string, Set<BurgerWS>>();

export function open(ws: BurgerWS) {
    console.log('[Broadcast] New connection');

    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Welcome to the broadcast server!',
    }));
}

export function message(ws: BurgerWS, message: string | Buffer) {
    try {
        const data = JSON.parse(message.toString());

        switch (data.action) {
            case 'subscribe':
                subscribe(ws, data.topic);
                break;

            case 'unsubscribe':
                unsubscribe(ws, data.topic);
                break;

            case 'publish':
                publish(ws, data.topic, data.message);
                break;

            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown action. Use subscribe, unsubscribe, or publish.',
                }));
        }
    } catch (error) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format.',
        }));
    }
}

export function close(ws: BurgerWS, code: number, reason: string) {
    console.log('[Broadcast] Connection closed');

    // Clean up subscriptions
    for (const [topic, subscribers] of topicSubscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
            topicSubscribers.delete(topic);
        }
    }
}

function subscribe(ws: BurgerWS, topic: string) {
    if (!topicSubscribers.has(topic)) {
        topicSubscribers.set(topic, new Set());
    }
    topicSubscribers.get(topic)!.add(ws);

    ws.send(JSON.stringify({
        type: 'subscribed',
        topic,
    }));

    console.log(`[Broadcast] Subscribed to ${topic}`);
}

function unsubscribe(ws: BurgerWS, topic: string) {
    const subscribers = topicSubscribers.get(topic);
    if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
            topicSubscribers.delete(topic);
        }
    }

    ws.send(JSON.stringify({
        type: 'unsubscribed',
        topic,
    }));

    console.log(`[Broadcast] Unsubscribed from ${topic}`);
}

function publish(ws: BurgerWS, topic: string, message: string) {
    const subscribers = topicSubscribers.get(topic);
    if (!subscribers || subscribers.size === 0) {
        ws.send(JSON.stringify({
            type: 'error',
            message: `No subscribers for topic: ${topic}`,
        }));
        return;
    }

    const payload = JSON.stringify({
        type: 'message',
        topic,
        message,
        timestamp: Date.now(),
    });

    for (const subscriber of subscribers) {
        subscriber.send(payload);
    }

    console.log(`[Broadcast] Published to ${topic}: ${subscribers.size} recipients`);
}
