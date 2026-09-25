/**
 * Portable constant-time string comparison.
 *
 * WinterCG-safe (no `node:crypto`): both strings are encoded to UTF-8 and
 * XOR-compared over the longer length, so byte comparison time does not
 * depend on the match position. Length is still observable through the
 * iteration bound — acceptable for credentials comparison where both sides
 * are server-controlled; equal-length values (e.g. hashed credentials) leak
 * nothing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let diff = aBytes.length ^ bBytes.length;
    for (let i = 0; i < maxLen; i++) {
        const av = i < aBytes.length ? aBytes[i]! : 0;
        const bv = i < bBytes.length ? bBytes[i]! : 0;
        diff |= av ^ bv;
    }
    return diff === 0;
}
