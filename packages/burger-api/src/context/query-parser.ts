/**
 * Fast, allocation-light querystring parser.
 *
 * One linear `charCodeAt` scan of the raw query string; never constructs a
 * `URL` or `URLSearchParams`, and `decodeURIComponent` runs only for segments
 * that actually contain a `%` or `+`.
 *
 * Behavior matches `URLSearchParams`, including the
 * `application/x-www-form-urlencoded` rule that `+` decodes to a space.
 * Malformed percent-encoding (and lone surrogates) is preserved verbatim and
 * never throws.
 */

/** Segment flags recorded while scanning one `key=value` pair. */
const KEY_NEEDS_DECODE = 1;
const KEY_HAS_PLUS = 2;
const VALUE_NEEDS_DECODE = 4;
const VALUE_HAS_PLUS = 8;

const CHAR_AMPERSAND = 38; // '&'
const CHAR_EQUALS = 61; // '='
const CHAR_PERCENT = 37; // '%'
const CHAR_PLUS = 43; // '+'
const CHAR_QUESTION = 63; // '?'

/**
 * Replaces every `+` with a space without regex/split allocations. Called
 * only when the scan already proved the segment contains a `+`.
 */
function replacePlus(segment: string): string {
    let out = '';
    let start = 0;
    let idx = segment.indexOf('+');
    while (idx !== -1) {
        out += segment.slice(start, idx) + ' ';
        start = idx + 1;
        idx = segment.indexOf('+', start);
    }
    return out + segment.slice(start);
}

/**
 * Decodes a single key/value segment: `+` normalized to a space, then
 * `decodeURIComponent`. Malformed escapes and lone surrogates make
 * `decodeURIComponent` throw, so we fall back to the raw substring (never
 * throws). The flags come from the caller's scan, so segments without
 * `%`/`+` skip decoding entirely.
 */
function decodeSegment(segment: string, flags: number): string {
    let value = segment;
    if (flags & (KEY_HAS_PLUS | VALUE_HAS_PLUS)) value = replacePlus(value);
    if (flags & (KEY_NEEDS_DECODE | VALUE_NEEDS_DECODE)) {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }
    return value;
}

/**
 * Parses a raw query string (after `?`, with or without the leading `?`)
 * into a `Record<string, string | string[]>`.
 *
 * - Empty input → `{}`; a segment without `=` maps its key to `""`.
 * - A repeated key becomes an array of values, in order.
 * - Keys and values are percent-decoded when needed; `+` becomes a space.
 * - The `[]` suffix is literal, not an array hint.
 * - Malformed percent-escapes are preserved verbatim; never throws.
 */
export function parseQuery(search: string): Record<string, string | string[]> {
    // Null prototype: `__proto__` / `constructor` keys are attacker-
    // controlled and must land as plain own properties, never touch the
    // object prototype.
    const result: Record<string, string | string[]> = Object.create(null);

    const len = search.length;
    // Tolerate a leading '?'.
    let i = len > 0 && search.charCodeAt(0) === CHAR_QUESTION ? 1 : 0;
    if (i === len) return result;

    let pairStart = i;
    let equalsIndex = -1;
    let keyFlags = 0;
    let valueFlags = 0;

    // One pass; a virtual `&` at `len` flushes the final pair.
    for (; i <= len; i++) {
        const code = i === len ? CHAR_AMPERSAND : search.charCodeAt(i);
        if (code === CHAR_AMPERSAND) {
            // Skip empty segments (e.g. trailing '&' or '&&').
            if (i > pairStart) {
                const key = decodeSegment(
                    equalsIndex === -1
                        ? search.slice(pairStart, i)
                        : search.slice(pairStart, equalsIndex),
                    keyFlags
                );
                const value =
                    equalsIndex === -1
                        ? ''
                        : decodeSegment(
                              search.slice(equalsIndex + 1, i),
                              valueFlags
                          );

                const existing = result[key];
                if (existing === undefined) {
                    result[key] = value;
                } else if (Array.isArray(existing)) {
                    existing.push(value);
                } else {
                    result[key] = [existing, value];
                }
            }
            pairStart = i + 1;
            equalsIndex = -1;
            keyFlags = 0;
            valueFlags = 0;
            continue;
        }
        if (equalsIndex === -1) {
            if (code === CHAR_EQUALS) {
                equalsIndex = i;
            } else if (code === CHAR_PERCENT) {
                keyFlags |= KEY_NEEDS_DECODE;
            } else if (code === CHAR_PLUS) {
                keyFlags |= KEY_HAS_PLUS;
            }
        } else if (code === CHAR_PERCENT) {
            valueFlags |= VALUE_NEEDS_DECODE;
        } else if (code === CHAR_PLUS) {
            valueFlags |= VALUE_HAS_PLUS;
        }
        // A second '=' belongs to the value and needs no decoding itself.
    }

    return result;
}
