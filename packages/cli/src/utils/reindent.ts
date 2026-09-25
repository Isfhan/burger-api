/**
 * Re-indents generated TS/JS source by bracket depth.
 *
 * Scaffold templates are assembled from string fragments whose leading
 * whitespace is easy to get wrong (and was once collapsed to single spaces
 * repo-wide), so generated files are normalized here on write instead of
 * trusting every template's hand-written indentation. Scaffolds ship a
 * `.prettierrc` with `tabWidth: 4`; this matches it.
 *
 * Deliberately small: it understands strings, template literals and
 * comments well enough not to count brackets inside them, and leaves the
 * inside of multi-line template literals untouched.
 */

const INDENT = '    ';
const OPENERS = '([{';
const CLOSERS = ')]}';

export function reindent(code: string): string {
    // One entry per open bracket: the index of the line that opened it.
    // Indent = number of distinct lines with unclosed brackets, so
    // `foo({` on one line adds a single level, not two.
    const open: number[] = [];
    const levels = (n: number) => new Set(open.slice(0, n)).size;
    let inBlockComment = false;
    let inTemplate = false;
    const out: string[] = [];
    const lines = code.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;
        const trimmed = line.trim();

        if (inTemplate) {
            // Content of a multi-line template literal is user-visible text.
            out.push(line);
        } else if (trimmed === '') {
            out.push('');
        } else if (inBlockComment || trimmed.startsWith('*')) {
            // JSDoc/block-comment continuation: align the `*` under `/**`.
            const pad = trimmed.startsWith('*') ? ' ' : '';
            out.push(INDENT.repeat(levels(open.length)) + pad + trimmed);
        } else {
            let leadingClosers = 0;
            while (
                leadingClosers < trimmed.length &&
                CLOSERS.includes(trimmed[leadingClosers]!)
            ) {
                leadingClosers++;
            }
            const n = Math.max(0, open.length - leadingClosers);
            out.push(INDENT.repeat(levels(n)) + trimmed);
        }

        // Update bracket/comment/template state from the line's code chars.
        let quote: string | null = null;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]!;
            const next = line[i + 1];
            if (inBlockComment) {
                if (ch === '*' && next === '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }
            if (inTemplate) {
                if (ch === '\\') i++;
                else if (ch === '`') inTemplate = false;
                continue;
            }
            if (quote) {
                if (ch === '\\') i++;
                else if (ch === quote) quote = null;
                continue;
            }
            if (ch === '/' && next === '/') break;
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                i++;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
            } else if (ch === '`') {
                inTemplate = true;
            } else if (OPENERS.includes(ch)) {
                open.push(lineIdx);
            } else if (CLOSERS.includes(ch)) {
                open.pop();
            }
        }
    }

    return out.join('\n');
}

/** True for paths whose content {@link reindent} should normalize. */
export function isReindentable(path: string): boolean {
    return /\.(ts|js|mjs)$/.test(path);
}
