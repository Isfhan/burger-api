import { describe, expect, it } from 'bun:test';
import { validatePort } from '../src/utils/build/project';

describe('validatePort', () => {
    it('normalizes valid ports to a plain string', () => {
        expect(validatePort('3000')).toEqual({ port: '3000' });
        expect(validatePort(' 42 ')).toEqual({ port: '42' });
        expect(validatePort('0042')).toEqual({ port: '42' });
        expect(validatePort('1')).toEqual({ port: '1' });
        expect(validatePort('65535')).toEqual({ port: '65535' });
    });

    it('rejects out-of-range and non-integer values', () => {
        for (const raw of ['0', '65536', '-1', 'abc', '1.5', '', '1e3']) {
            expect(validatePort(raw)).toHaveProperty('error');
        }
    });
});
