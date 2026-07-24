/**
 * Fast, allocation-light cookie parser.
 *
 * Parses a `Cookie` header value into a flat `Record<string, string>`.
 * Follows the same design philosophy as `query-parser.ts`:
 * - Single linear scan, no `URL` / `URLSearchParams` allocation.
 * - Malformed percent-encoding is preserved verbatim and never throws.
 * - The `[]` suffix is treated literally (not as an array hint).
 */

function safeDecode(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * Parses a raw `Cookie` header value into a flat record.
 *
 * Rules:
 * - Empty / null input → `Object.create(null)`.
 * - A segment without `=` is a valueless key → `""`.
 * - Repeated keys take the **last** value (per RFC 6265 §5.4, the first
 *   cookie with a given name takes precedence, but for simplicity and
 *   consistency with common runtimes we use last-wins).
 * - Every key and value is run through `decodeURIComponent`; malformed
 *   percent-escapes are preserved verbatim.
 * - The result is a prototype-less object (`Object.create(null)`) to avoid
 *   prototype-chain lookups on hot paths.
 */
export function parseCookies(
    header: string | null | undefined
): Record<string, string> {
    if (!header) return Object.create(null) as Record<string, string>;

    const result: Record<string, string> = Object.create(null);
    const pairs = header.split(';');
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (pair === '') continue;

        const eq = pair.indexOf('=');
        let key: string;
        let value: string;
        if (eq === -1) {
            key = pair.trim();
            value = '';
        } else {
            key = pair.slice(0, eq).trim();
            value = pair.slice(eq + 1).trim();
        }

        if (key) result[key] = safeDecode(value);
    }

    return result;
}
