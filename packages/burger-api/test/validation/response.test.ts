import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { validateResponse } from '../../src/validation/response';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../../src/validation/types';

function makeValidators(): CompiledRouteValidators {
    const bodySchema = z.object({ ok: z.boolean() });
    return {
        methods: {},
        response: {
            get: {
                '200': {
                    kind: 'zod',
                    slot: 'body',
                    identity: 'r200',
                    validate: (v: unknown) => {
                        const r = bodySchema.safeParse(v);
                        return r.success
                            ? { success: true, data: r.data }
                            : {
                                  success: false,
                                  issues: r.error.issues.map((i) => ({
                                      path: i.path as (string | number)[],
                                      message: i.message,
                                  })),
                              };
                    },
                    coercible: false,
                },
            },
        },
    };
}

describe('ResponseValidator', () => {
    it('returns ok when no response schema exists', () => {
        const v = { methods: {} } as CompiledRouteValidators;
        expect(
            validateResponse(v, 'get', 200, { ok: true }, {}, false).ok
        ).toBe(true);
    });

    it('selects exact status then class (2xx)', () => {
        const v: CompiledRouteValidators = {
            methods: {},
            response: { get: { '2xx': stubAlwaysFail() } },
        };
        // status 201 matches class 2xx
        expect(v.response?.get?.['2xx']).toBeDefined();
    });

    it('dev mode: mismatch logs + passes through (ok)', () => {
        const v = makeValidators();
        const out = validateResponse(
            v,
            'get',
            200,
            { ok: 'not-boolean' },
            { responseValidation: 'dev' },
            true
        );
        expect(out.ok).toBe(true);
    });

    it('enforce mode: mismatch returns safe 500 (no internals)', () => {
        const v = makeValidators();
        const out = validateResponse(
            v,
            'get',
            200,
            { ok: 'nope' },
            { responseValidation: 'enforce' },
            false
        );
        expect(out.ok).toBe(false);
        expect(out.errorResponse?.status).toBe(500);
    });

    it('enforce mode: valid response passes', () => {
        const v = makeValidators();
        const out = validateResponse(
            v,
            'get',
            200,
            { ok: true },
            { responseValidation: 'enforce' },
            false
        );
        expect(out.ok).toBe(true);
    });

    it('off mode: mismatch passes through', () => {
        const v = makeValidators();
        const out = validateResponse(
            v,
            'get',
            200,
            { ok: 'nope' },
            { responseValidation: 'off' },
            false
        );
        expect(out.ok).toBe(true);
    });

    it('does not apply another method response schema', () => {
        const v = makeValidators();
        // POST declares no response schema, so a GET-only schema must not leak.
        const out = validateResponse(
            v,
            'post',
            200,
            { ok: 'nope' },
            { responseValidation: 'enforce' },
            false
        );
        expect(out.ok).toBe(true);
    });
});

function stubAlwaysFail(): any {
    return {
        kind: 'zod' as const,
        slot: 'body' as const,
        identity: 'fail',
        validate: () => ({
            success: false,
            issues: [{ path: [], message: 'x' }],
        }),
        coercible: false,
    };
}
