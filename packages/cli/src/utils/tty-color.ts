/**
 * Plain-text output on a non-TTY.
 *
 * The logger and spinners detect a non-TTY themselves, but `@clack/prompts`
 * colors through `picocolors` (CJS) with ANSI enabled on win32, and that
 * loads before any ESM body runs — so setting NO_COLOR here is too late for
 * it. Set the flag anyway and strip SGR sequences from both output streams;
 * an explicit FORCE_COLOR wins.
 *
 * Imported first from the entry point so the patch lands before any command
 * module can print.
 */
const ANSI_SGR = /\x1b\[[0-9;]*m/g;

function stripAnsi(chunk: unknown): unknown {
    return typeof chunk === 'string' ? chunk.replace(ANSI_SGR, '') : chunk;
}

function patchStream(stream: NodeJS.WriteStream): void {
    const original = stream.write.bind(stream) as (
        chunk: unknown,
        encoding?: unknown,
        cb?: unknown
    ) => boolean;
    (stream as unknown as { write: unknown }).write = (
        chunk: unknown,
        encoding?: unknown,
        cb?: unknown
    ) => original(stripAnsi(chunk), encoding, cb);
}

if (!process.stdout.isTTY && !process.env.FORCE_COLOR) {
    process.env.NO_COLOR ??= '1';
    patchStream(process.stdout);
    patchStream(process.stderr);
}
