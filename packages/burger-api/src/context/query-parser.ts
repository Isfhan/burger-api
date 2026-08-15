/**
 * Fast, allocation-light, Bun-native querystring parser.
 *
 * Replaces the per-request `new URL(req.url)` + `URLSearchParams` allocation
 * previously used in the validator. It performs a single linear scan of the
 * raw query string and never constructs a `URL` or `URLSearchParams`.
 *
 * Behavior matches `URLSearchParams` parity (: "match
 * `URLSearchParams` parity so the existing validator behavior is preserved
 * exactly"), which includes the `application/x-www-form-urlencoded` rule that
 * `+` decodes to a space. Malformed percent-encoding is preserved verbatim and
 * never throws.
 */

/**
 * Decodes a single key/value segment. `application/x-www-form-urlencoded`
 * rules apply: `+` is first normalized to a space, then `decodeURIComponent`
 * runs. `decodeURIComponent` throws on a malformed percent sequence (e.g. an
 * incomplete `%XX`), so we fall back to the (space-normalized) raw substring —
 * preserving it verbatim and continuing, exactly like the documented
 * malformed-decoding behavior.
 */
function safeDecode(segment: string): string {
    const spaced = segment.replace(/\+/g, ' ');
    try {
        return decodeURIComponent(spaced);
    } catch {
        return spaced;
    }
}

/**
 * Parses a raw query string (the portion after `?`, with or without the leading
 * `?`) into a `Record<string, string | string[]>`.
 *
 * Rules:
 * - Empty input → `{}`.
 * - A segment without `=` is a valueless key → `""`.
 * - A repeated key becomes an array of its values, in order.
 * - Every key and value is run through `decodeURIComponent`; `+` is normalized
 * to a space first (form-encoding parity with `URLSearchParams`).
 * - The `[]` suffix is treated literally (not as an array hint).
 * - Malformed percent-escapes are preserved verbatim; the parser never throws.
 */
export function parseQuery(search: string): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};

    // Tolerate a leading '?'.
    const qs = search.startsWith('?') ? search.slice(1) : search;
    if (qs === '') return result;

    const pairs = qs.split('&');
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]!;
        // Skip empty segments (e.g. trailing '&' or '&&').
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

        key = safeDecode(key);
        value = safeDecode(value);

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
