import { describe, it, expect } from 'bun:test';
import { renderValidationError } from '../../src/validation/error';
import type {
    ValidationResult,
    ValidatorConfig,
} from '../../src/validation/types';

const fail: ValidationResult = {
    success: false,
    issues: [
        {
            path: ['query', 'n'],
            message: 'Expected number',
            code: 'invalid_type',
        },
    ],
};

function bodyOf(res: Response): any {
    return res.json();
}

describe('renderValidationError', () => {
    it('plain format emits issues under the slot key', async () => {
        const res = renderValidationError(fail, {
            status: 422,
            isDev: false,
            slot: 'query',
            config: {},
        });
        expect(res.status).toBe(422);
        const b = await bodyOf(res);
        expect(b.errors.query).toBeDefined();
        expect(b.errors.query[0].path).toEqual(['query', 'n']);
    });

    it('problem+json emits the RFC 9457 shape (path/message only)', async () => {
        const res = renderValidationError(fail, {
            status: 422,
            isDev: false,
            slot: 'query',
            config: { errorFormat: 'problem+json' },
        });
        expect(res.headers.get('content-type')).toBe(
            'application/problem+json'
        );
        const b = await bodyOf(res);
        expect(b.type).toBe('about:blank');
        expect(b.title).toBe('Validation Error');
        expect(b.status).toBe(422);
        expect(b.errors[0]).toEqual({
            path: ['query', 'n'],
            message: 'Expected number',
        });
    });

    it('does NOT leak stacks or source in production', async () => {
        const res = renderValidationError(fail, {
            status: 422,
            isDev: false,
            slot: 'query',
            config: {},
        });
        const text = JSON.stringify(await bodyOf(res));
        expect(text).not.toContain('stack');
        expect(text).not.toContain('source');
    });

    it('custom errorRenderer fully controls the body', async () => {
        const config: ValidatorConfig = {
            errorRenderer: (r, ctx) =>
                new Response(
                    JSON.stringify({ custom: true, status: ctx.status }),
                    { status: 418 }
                ),
        };
        const res = renderValidationError(fail, {
            status: 422,
            isDev: false,
            slot: 'query',
            config,
        });
        expect(res.status).toBe(418);
        const b = await bodyOf(res);
        expect(b.custom).toBe(true);
    });

    it('success result is rejected (renderer only handles failures)', () => {
        expect(() =>
            renderValidationError(
                { success: true, data: {} },
                { status: 422, isDev: false, slot: 'query', config: {} }
            )
        ).toThrow(/renderValidationError called with a successful/);
    });

    it('errorsBySlot emits one key per failing slot', async () => {
        const res = renderValidationError(fail, {
            status: 422,
            isDev: false,
            errorsBySlot: {
                query: [{ path: ['query', 'n'], message: 'Expected number' }],
                body: [{ path: ['body', 'name'], message: 'Required' }],
            },
            config: {},
        });
        const b = await bodyOf(res);
        expect(b.errors.query[0].message).toBe('Expected number');
        expect(b.errors.body[0].message).toBe('Required');
        // Each issue stays under its own slot — not collapsed under one key.
        expect(b.errors.query).toHaveLength(1);
        expect(b.errors.body).toHaveLength(1);
    });
});
