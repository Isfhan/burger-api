import { describe, it, expect } from 'bun:test';
import { parseQuery } from '../../src/context/query-parser';

describe('parseQuery (fast Bun-native parser)', () => {
    it('returns {} for empty input (no allocation of pairs)', () => {
        expect(parseQuery('')).toEqual({});
        expect(parseQuery('?')).toEqual({});
    });

    it('treats a key without = as a valueless key → ""', () => {
        expect(parseQuery('a')).toEqual({ a: '' });
        expect(parseQuery('a&b')).toEqual({ a: '', b: '' });
    });

    it('decodes duplicate keys into an array, preserving order', () => {
        // Preserves request order — required so validators see values the same
        // way every time.
        expect(parseQuery('a=1&a=2&a=3')).toEqual({ a: ['1', '2', '3'] });
        expect(parseQuery('a=1&b=2&a=3')).toEqual({ a: ['1', '3'], b: '2' });
    });

    it('normalizes + to a space (URLSearchParams / form-encoding parity)', () => {
        // Backward compatibility: Phase 1 used URLSearchParams, which decodes +.
        expect(parseQuery('search=test+product+search')).toEqual({
            search: 'test product search',
        });
    });

    it('decodes %XX escapes (incl. %20 → space)', () => {
        expect(parseQuery('a=hello%20world')).toEqual({ a: 'hello world' });
        expect(parseQuery('a=%2B')).toEqual({ a: '+' });
    });

    it('preserves malformed %XX substrings and never throws', () => {
        // Graceful leniency: a bad escape must not abort the rest of the query.
        expect(parseQuery('a=%A')).toEqual({ a: '%A' });
        expect(parseQuery('a=%E0%A4&b=2')).toEqual({ a: '%E0%A4', b: '2' });
        expect(() => parseQuery('a=%ZZ')).not.toThrow();
    });

    it('treats [] as a literal key character (no array hint)', () => {
        expect(parseQuery('a[]=1')).toEqual({ 'a[]': '1' });
    });

    it('skips empty & segments', () => {
        expect(parseQuery('a=1&&b=2&')).toEqual({ a: '1', b: '2' });
    });

    it('tolerates a leading ?', () => {
        expect(parseQuery('?a=1')).toEqual({ a: '1' });
    });
});
