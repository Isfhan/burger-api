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
        // Backward compatibility: used URLSearchParams, which decodes +.
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

    it('handles empty keys/values and "=" inside values', () => {
        expect(parseQuery('=1')).toEqual({ '': '1' });
        expect(parseQuery('a=')).toEqual({ a: '' });
        expect(parseQuery('a=1=2')).toEqual({ a: '1=2' });
        expect(parseQuery('a=&&b=1')).toEqual({ a: '', b: '1' });
        expect(parseQuery('&=')).toEqual({ '': '' });
    });

    it('merges valueless and valued occurrences of the same key', () => {
        expect(parseQuery('a&a=1')).toEqual({ a: ['', '1'] });
        expect(parseQuery('a=1&a')).toEqual({ a: ['1', ''] });
    });

    it('merges keys that only collide after decoding', () => {
        expect(parseQuery('a%20b=1&a+b=2')).toEqual({ 'a b': ['1', '2'] });
    });

    it('decodes unicode escapes and keeps "+" literal when encoded', () => {
        expect(parseQuery('q=caf%C3%A9&x=%2B')).toEqual({
            q: 'café',
            x: '+',
        });
    });

    it('tolerates trailing & and only-& input', () => {
        expect(parseQuery('&')).toEqual({});
        expect(parseQuery('&&')).toEqual({});
        expect(parseQuery('a=1&')).toEqual({ a: '1' });
    });

    it('preserves malformed escapes exactly (raw, plus-normalized)', () => {
        expect(parseQuery('%zz=1')).toEqual({ '%zz': '1' });
        expect(parseQuery('a=%E0%A4%A')).toEqual({ a: '%E0%A4%A' });
        expect(parseQuery('a=bad%+plus')).toEqual({ a: 'bad% plus' });
    });
});

/**
 * The pre-rewrite implementation, kept verbatim as the differential
 * reference: `split('&')` + per-pair regex + unconditional decode. The
 * charCodeAt scanner must produce identical output for every input.
 */
function legacyParseQuery(search: string): Record<string, string | string[]> {
    const legacyDecode = (segment: string): string => {
        const spaced = segment.replace(/\+/g, ' ');
        try {
            return decodeURIComponent(spaced);
        } catch {
            return spaced;
        }
    };
    const result: Record<string, string | string[]> = Object.create(null);
    const qs = search.startsWith('?') ? search.slice(1) : search;
    if (qs === '') return result;
    const pairs = qs.split('&');
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]!;
        if (pair === '') continue;
        const eq = pair.indexOf('=');
        let key: string;
        let value: string;
        if (eq === -1) {
            key = pair;
            value = '';
        } else {
            key = pair.slice(0, eq);
            value = pair.slice(eq + 1);
        }
        key = legacyDecode(key);
        value = legacyDecode(value);
        const existing = result[key];
        if (existing === undefined) {
            result[key] = value;
        } else if (Array.isArray(existing)) {
            existing.push(value);
        } else {
            result[key] = [existing, value];
        }
    }
    return result;
}

describe('parseQuery — differential parity with the legacy parser', () => {
    const corpus = [
        '',
        '?',
        '&',
        '&&&',
        'a',
        'a=',
        '=1',
        '=',
        'a=1',
        'a=1&b=2',
        'a=1&a=2&a=3',
        'a&a=1',
        'a=1&a',
        'a=1=2=3',
        'a=1&&b=2&',
        '?a=1&b=2',
        'search=test+product+search',
        'a+b=c+d',
        '+%2B+',
        'a=hello%20world',
        'a=%2B',
        'a=%A',
        'a=%E0%A4&b=2',
        'a=%ZZ',
        '%zz=1',
        '%=1',
        'a=%',
        'a=%2',
        'a=%25',
        'a=100%25',
        'a[]=1',
        'a[]=1&a[]=2',
        '__proto__=a',
        '__proto__=a&__proto__=b&x=1',
        'constructor=1&x=2',
        'q=caf%C3%A9&x=%2B',
        'a%20b=1&a+b=2',
        'k=%E2%82%AC',
        'k=%F0%9F%8D%94',
        'a=1&b=&c',
        'x=%00',
        'x=%0A',
        'x=a%3Db',
        'x=a%26b',
        'x=a%2Bb',
        'x=+%2B+',
        'x=%C3%A9+%C3%A8',
    ];

    it('matches the legacy parser for every corpus entry', () => {
        for (let i = 0; i < corpus.length; i++) {
            const input = corpus[i]!;
            expect(parseQuery(input)).toEqual(legacyParseQuery(input));
        }
    });

    it('matches URLSearchParams for well-formed input', () => {
        const wellFormed = [
            '',
            'a=1',
            'a=1&b=2',
            'a=1&a=2&a=3',
            'search=test+product+search',
            'a=hello%20world',
            'a=%2B',
            'q=caf%C3%A9',
            'a[]=1',
            '__proto__=a',
            'x=%00&y=%0A',
            'a=1&b=&c',
            'a=1=2',
        ];
        for (let i = 0; i < wellFormed.length; i++) {
            const qs = wellFormed[i]!;
            const params = new URLSearchParams(qs);
            const expected: Record<string, string | string[]> =
                Object.create(null);
            for (const [key, value] of params) {
                const existing = expected[key];
                if (existing === undefined) expected[key] = value;
                else if (Array.isArray(existing)) existing.push(value);
                else expected[key] = [existing, value];
            }
            expect(parseQuery(qs)).toEqual(expected);
        }
    });
});
