/**
 * B6 — `extractPathnameFromUrl` stops at `?` and `#` in a single scan and
 * preserves the historical fallback for inputs without a path segment.
 */
import { describe, it, expect } from 'bun:test';
import { extractPathnameFromUrl } from '../../src/utils/wildcard';

describe('extractPathnameFromUrl', () => {
    it('returns the pathname and drops the query string', () => {
        expect(
            extractPathnameFromUrl(
                'http://localhost:4000/api/users/123/profile?id=1'
            )
        ).toBe('/api/users/123/profile');
    });

    it('drops a fragment (parity with new Request(url).url)', () => {
        expect(extractPathnameFromUrl('http://h/a/b#section?x=1')).toBe(
            '/a/b'
        );
        expect(extractPathnameFromUrl('http://h/a/b?x=1#section')).toBe(
            '/a/b'
        );
    });

    it('preserves encoded segments and repeated slashes', () => {
        expect(extractPathnameFromUrl('http://h/a%20b/c')).toBe('/a%20b/c');
        expect(extractPathnameFromUrl('http://h/a//b')).toBe('/a//b');
    });

    it('returns "/" for a root URL and tolerates no-path inputs', () => {
        expect(extractPathnameFromUrl('http://h/')).toBe('/');
        expect(extractPathnameFromUrl('http://h')).toBe('http://h');
    });
});
