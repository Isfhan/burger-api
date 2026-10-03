/**
 * Re-indent generated TS/JS source by bracket depth, so templates with
 * hand-written whitespace are normalized on write. Uses 4 spaces, matching
 * the scaffold `.prettierrc` (`tabWidth: 4`).
 *
 * Small on purpose: skips brackets inside strings, comments, and template
 * literals, and leaves multi-line template literal contents untouched.
 */

const INDENT = '    ';
const OPENERS = '([{';
const CLOSERS = ')]}';

export function reindent(code: string): string {
    // One entry per open bracket (the line that opened it). Indent = number
    // of distinct opening lines, so `foo({` adds one level, not two.
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
            // JSDoc/block-comment continuation: align `*` under `/**`.
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

        // Update bracket/comment/template state from this line.
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
