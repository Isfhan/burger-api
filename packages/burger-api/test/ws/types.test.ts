import { describe, it, expect } from 'bun:test';
import {
    BurgerWSContext,
    WebSocketReadyState,
    WebSocketCloseCode,
} from '../../src/ws/types';
import type { BurgerWS } from '../../src/ws/types';

describe('BurgerWSContext', () => {
    // Mock Bun's ServerWebSocket
    const createMockWs = (overrides: Record<string, any> = {}): any => ({
        send: () => {},
        sendText: () => {},
        sendBinary: () => {},
        close: () => {},
        terminate: () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        publish: () => {},
        publishText: () => {},
        publishBinary: () => {},
        isSubscribed: () => false,
        cork: (cb: () => void) => cb(),
        data: {},
        readyState: WebSocketReadyState.OPEN,
        remoteAddress: '127.0.0.1',
        ...overrides,
    });

    it('should create context from Bun WebSocket', () => {
        const mockWs = createMockWs();
        const ctx = new BurgerWSContext(mockWs);

        expect(ctx).toBeDefined();
        expect(ctx.remoteAddress).toBe('127.0.0.1');
    });

    it('should proxy send method', () => {
        let sentMessage: any = null;
        const mockWs = createMockWs({
            sendText: (msg: any) => {
                sentMessage = msg;
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.send('hello');

        expect(sentMessage).toBe('hello');
    });

    it('should proxy sendText method', () => {
        let sentMessage: any = null;
        const mockWs = createMockWs({
            sendText: (msg: any) => {
                sentMessage = msg;
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.sendText('hello');

        expect(sentMessage).toBe('hello');
    });

    it('should proxy sendBinary method', () => {
        let sentMessage: any = null;
        const mockWs = createMockWs({
            sendBinary: (msg: any) => {
                sentMessage = msg;
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        const buffer = Buffer.from('binary data');
        ctx.sendBinary(buffer);

        expect(sentMessage).toBe(buffer);
    });

    it('should proxy subscribe method', () => {
        let subscribedTopic: string | null = null;
        const mockWs = createMockWs({
            subscribe: (topic: string) => {
                subscribedTopic = topic;
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.subscribe('chat');

        expect(subscribedTopic).toBe('chat');
    });

    it('should proxy unsubscribe method', () => {
        let unsubscribedTopic: string | null = null;
        const mockWs = createMockWs({
            unsubscribe: (topic: string) => {
                unsubscribedTopic = topic;
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.unsubscribe('chat');

        expect(unsubscribedTopic).toBe('chat');
    });

    it('should proxy publish method', () => {
        let published: { topic: string; message: any } | null = null;
        const mockWs = createMockWs({
            publishText: (topic: string, msg: any) => {
                published = { topic, message: msg };
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.publish('chat', 'hello');

        expect(published?.topic).toBe('chat');
        expect(published?.message).toBe('hello');
    });

    it('should proxy publishText method', () => {
        let published: { topic: string; message: any } | null = null;
        const mockWs = createMockWs({
            publishText: (topic: string, msg: any) => {
                published = { topic, message: msg };
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.publishText('chat', 'hello');

        expect(published?.topic).toBe('chat');
        expect(published?.message).toBe('hello');
    });

    it('should proxy publishBinary method', () => {
        let published: { topic: string; message: any } | null = null;
        const mockWs = createMockWs({
            publishBinary: (topic: string, msg: any) => {
                published = { topic, message: msg };
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        const buffer = Buffer.from('binary data');
        ctx.publishBinary('chat', buffer);

        expect(published?.topic).toBe('chat');
        expect(published?.message).toBe(buffer);
    });

    it('should proxy close method', () => {
        let closeCall: { code?: number; reason?: string } | null = null;
        const mockWs = createMockWs({
            close: (code?: number, reason?: string) => {
                closeCall = { code, reason };
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.close(1000, 'bye');

        expect(closeCall?.code).toBe(1000);
        expect(closeCall?.reason).toBe('bye');
    });

    it('should proxy terminate method', () => {
        let terminated = false;
        const mockWs = createMockWs({
            terminate: () => {
                terminated = true;
            },
        });

        const ctx = new BurgerWSContext(mockWs);
        ctx.terminate();

        expect(terminated).toBe(true);
    });

    it('should expose data property', () => {
        const mockWs = createMockWs({
            data: { userId: '123' },
        });

        const ctx = new BurgerWSContext(mockWs);

        expect(ctx.data.userId).toBe('123');
    });

    it('should have correct readyState', () => {
        const mockWs = createMockWs({
            readyState: WebSocketReadyState.OPEN,
        });

        const ctx = new BurgerWSContext(mockWs);

        expect(ctx.readyState).toBe(WebSocketReadyState.OPEN);
    });

    it('should return readyState from underlying ws', () => {
        const mockWs = createMockWs({
            readyState: WebSocketReadyState.CLOSED,
        });

        const ctx = new BurgerWSContext(mockWs);

        expect(ctx.readyState).toBe(WebSocketReadyState.CLOSED);
    });
});

describe('WebSocketReadyState enum', () => {
    it('should have correct values', () => {
        expect(WebSocketReadyState.CONNECTING).toBe(0);
        expect(WebSocketReadyState.OPEN).toBe(1);
        expect(WebSocketReadyState.CLOSING).toBe(2);
        expect(WebSocketReadyState.CLOSED).toBe(3);
    });
});

describe('WebSocketCloseCode enum', () => {
    it('should have correct values', () => {
        expect(WebSocketCloseCode.NORMAL_CLOSURE).toBe(1000);
        expect(WebSocketCloseCode.GOING_AWAY).toBe(1001);
        expect(WebSocketCloseCode.PROTOCOL_ERROR).toBe(1002);
        expect(WebSocketCloseCode.UNSUPPORTED_DATA).toBe(1003);
        expect(WebSocketCloseCode.INTERNAL_ERROR).toBe(1011);
    });
});
