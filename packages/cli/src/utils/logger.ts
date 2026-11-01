/**
 * Console output helpers: ANSI colors and symbols, with ASCII fallbacks on
 * older Windows terminals and plain text when piped.
 */

/** True when the terminal renders Unicode symbols; ASCII is used otherwise. */
function supportsUnicode(): boolean {
    if (process.platform !== 'win32') {
        return true;
    }

    // Windows Terminal
    if (process.env.WT_SESSION) {
        return true;
    }

    // VS Code
    if (process.env.TERM_PROGRAM === 'vscode') {
        return true;
    }

    // ConEmu/Cmder
    if (process.env.ConEmuANSI === 'ON') {
        return true;
    }

    // Modern terminal emulators
    if (process.env.TERM && process.env.TERM !== 'dumb') {
        return true;
    }

    // CI environments
    if (process.env.CI) {
        return true;
    }

    // Windows CMD and older PowerShell fall back to ASCII
    return false;
}

/** ANSI color codes for terminal output. */
const ansiColors = {
    reset: '\x1b[0m', // Reset to default color
    bright: '\x1b[1m', // Make text bright/bold
    dim: '\x1b[2m', // Make text dim

    // Regular colors
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background colors (for highlighting)
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

/**
 * Colors only on a TTY, and never with NO_COLOR; FORCE_COLOR opts back in.
 */
const useColor =
    Boolean(process.env.FORCE_COLOR) ||
    (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
const colors = Object.fromEntries(
    Object.entries(ansiColors).map(([k, v]) => [k, useColor ? v : ''])
) as typeof ansiColors;

/** Unicode symbols for modern terminals. */
const unicodeSymbols = {
    success: '[OK]',
    error: '[X]',
    info: '[i]',
    warning: '[!]',
    arrow: '[->]',
    bullet: '[•]',
    star: '[★]',
};

/** ASCII fallback symbols for older Windows terminals. */
const asciiSymbols = {
    success: '[OK]',
    error: '[X]',
    info: '[i]',
    warning: '[!]',
    arrow: '[->]',
    bullet: '•',
    star: '[*]',
};

/** Symbols for message types; ASCII fallbacks on older Windows terminals. */
const symbols = supportsUnicode() ? unicodeSymbols : asciiSymbols;

/** Animated output (spinner frames, cursor control) only on a real terminal. */
const isTTY = Boolean(process.stdout.isTTY);

/** The spinner currently drawing on the last line, if any. */
let activeSpinner: Spinner | null = null;

/**
 * Clear the spinner's line before printing, so log lines written mid-spin
 * start clean. The spinner redraws itself on its next frame.
 */
function clearSpinnerLine(): void {
    if (activeSpinner && isTTY) process.stdout.write('\r\x1B[K');
}

/**
 * Show a success message (green with checkmark).
 *
 * @param message - The message to display
 */
export function success(message: string): void {
    clearSpinnerLine();
    console.log(`${colors.green}${symbols.success}${colors.reset} ${message}`);
}

/**
 * Show an error message (red with X).
 *
 * @param message - The error message to display
 */
export function error(message: string): void {
    clearSpinnerLine();
    console.log(`${colors.red}${symbols.error}${colors.reset} ${message}`);
}

/**
 * Show an info message (blue with info symbol).
 *
 * @param message - The info message to display
 */
export function info(message: string): void {
    clearSpinnerLine();
    console.log(`${colors.blue}${symbols.info}${colors.reset} ${message}`);
}

/**
 * Show a warning message (yellow with warning symbol).
 *
 * @param message - The warning message to display
 */
export function warning(message: string): void {
    clearSpinnerLine();
    console.log(`${colors.yellow}${symbols.warning}${colors.reset} ${message}`);
}

/**
 * Show a step message with an arrow.
 *
 * @param message - The message to display
 */
export function step(message: string): void {
    console.log(`${colors.cyan}${symbols.arrow}${colors.reset} ${message}`);
}

/**
 * Return a highlighted (bold and bright) string.
 *
 * @param message - The message to highlight
 * @returns Formatted string with ANSI codes
 */
export function highlight(message: string): string {
    return `${colors.bright}${message}${colors.reset}`;
}

/** Return a dimmed (gray) string — plain text when colors are off. */
export function dimText(message: string): string {
    return `${colors.gray}${colors.dim}${message}${colors.reset}`;
}

/**
 * Show a dimmed message (gray and dim).
 *
 * @param message - The message to dim
 */
export function dim(message: string): void {
    clearSpinnerLine();
    console.log(`${colors.gray}${colors.dim}${message}${colors.reset}`);
}

/**
 * Show a bulleted list item.
 *
 * @param message - The message to display
 */
export function bullet(message: string): void {
    console.log(` ${colors.gray}${symbols.bullet}${colors.reset} ${message}`);
}

/** Print a blank line. */
export function newline(): void {
    console.log();
}

/** Line character for separators; ASCII on older Windows terminals. */
const lineChar = supportsUnicode() ? '─' : '-';

/** Print a horizontal line separator. */
export function separator(): void {
    console.log(colors.gray + lineChar.repeat(50) + colors.reset);
}

/**
 * Print a header with a title and underline.
 *
 * @param title - The header title
 */
export function header(title: string): void {
    newline();
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(colors.gray + lineChar.repeat(title.length) + colors.reset);
    newline();
}

/**
 * Show a command the user can run.
 *
 * @param command - The command to display
 */
export function command(command: string): void {
    console.log(
        ` ${colors.dim}$${colors.reset} ${colors.cyan}${command}${colors.reset}`
    );
}

/**
 * Show code or file content in monospace style.
 *
 * @param code - The code to display
 */
export function code(code: string): void {
    console.log(` ${colors.gray}${code}${colors.reset}`);
}

/** Spinner frames: Unicode for modern terminals, ASCII for CMD. */
const spinnerFrames = supportsUnicode()
    ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    : ['|', '/', '-', '\\'];

/**
 * Progress spinner for long-running work. On a non-TTY it prints no frames
 * or cursor control, only the message passed to {@link Spinner.stop}.
 */
export class Spinner {
    private frames = spinnerFrames;
    private currentFrame = 0;
    private intervalId: Timer | null = null;
    private message: string;

    constructor(message: string) {
        this.message = message;
        this.start();
    }

    /** Start the spinner animation. */
    private start(): void {
        activeSpinner = this;
        // Non-TTY (CI, pipes, tests): no frames or cursor control.
        if (!isTTY) return;

        // Hide cursor
        process.stdout.write('\x1B[?25l');

        this.render();

        this.intervalId = setInterval(() => {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.render();
        }, 80);
    }

    /** Render the current frame. */
    private render(): void {
        if (!isTTY) return;
        // Clear the line and move the cursor to the beginning
        process.stdout.write('\r\x1B[K');
        process.stdout.write(
            `${colors.cyan}${this.frames[this.currentFrame]}${colors.reset} ${
                this.message
            }`
        );
    }

    /**
     * Update the spinner message.
     *
     * @param message - New message to display
     */
    update(message: string): void {
        this.message = message;
        this.render();
    }

    /**
     * Stop the spinner and show the final message.
     *
     * @param finalMessage - Optional message to show when done
     * @param isError - Whether this is an error (shows X instead of checkmark)
     */
    stop(finalMessage?: string, isError = false): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (activeSpinner === this) activeSpinner = null;

        if (isTTY) {
            // Clear the spinner line
            process.stdout.write('\r\x1B[K');

            // Show cursor again
            process.stdout.write('\x1B[?25h');
        }

        if (finalMessage) {
            if (isError) {
                error(finalMessage);
            } else {
                success(finalMessage);
            }
        }
    }
}

/**
 * Create and start a new spinner.
 *
 * @param message - The message to display while spinning
 * @returns A Spinner instance
 */
export function spinner(message: string): Spinner {
    return new Spinner(message);
}

/**
 * Run an async task with a spinner; on throw, stop it with error state and
 * rethrow, so callers never have to remember to stop the spinner.
 *
 * @param message - Spinner message
 * @param fn - Async callback receiving the spinner
 * @returns Result of fn
 */
export async function withSpinner<T>(
    message: string,
    fn: (spin: Spinner) => Promise<T>
): Promise<T> {
    const spin = new Spinner(message);
    try {
        const result = await fn(spin);
        spin.stop();
        return result;
    } catch (err) {
        spin.stop(message.replace(/\s*\.\.\.\s*$/, '') + ' failed', true);
        throw err;
    }
}

/**
 * Format bytes as a human-readable size (B, KB, MB, GB).
 *
 * @param bytes - Size in bytes
 * @returns Formatted string like "1.43 MB"
 */
export function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024)
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const LOGO_TEXT = `
██╗    ██████╗ ██╗   ██╗██████╗  ██████╗ ███████╗██████╗  █████╗ ██████╗ ██╗
╚██╗   ██╔══██╗██║   ██║██╔══██╗██╔════╝ ██╔════╝██╔══██╗██╔══██╗██╔══██╗██║
 ╚██╗  ██████╦╝██║   ██║██████╔╝██║  ██╗ █████╗  ██████╔╝███████║██████╔╝██║
 ██╔╝  ██╔══██╗██║   ██║██╔══██╗██║  ╚██╗██╔══╝  ██╔══██╗██╔══██║██╔═══╝ ██║
██╔╝   ██████╦╝╚██████╔╝██║  ██║╚██████╔╝███████╗██║  ██║██║  ██║██║     ██║
╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
`.replace(/^\n+|\n+$/g, '');

/**
 * Print the BurgerAPI CLI banner.
 *
 * @param version - CLI version (e.g. from package.json); defaults to '0.0.0'
 */
export function showBanner(version: string = '0.0.0'): void {
    const bannerColor = useColor ? '\x1b[38;2;255;204;153m' : ''; // Warm orange color

    const reset = colors.reset;
    const tagline = `CLI tool for BurgerAPI projects - v${version}`;

    console.log(`${bannerColor}
${LOGO_TEXT}
${tagline}
${reset}`);
}

/**
 * Print a simple table.
 *
 * @param rows - Row data; the first row is the header
 */
export function table(rows: string[][]): void {
    if (rows.length === 0) return;

    const colWidths: number[] = [];
    for (let col = 0; col < (rows[0]?.length ?? 0); col++) {
        let maxWidth = 0;
        for (const row of rows) {
            if (row[col]?.length && (row[col]?.length ?? 0) > maxWidth) {
                maxWidth = row[col]?.length ?? 0;
            }
        }
        colWidths.push(maxWidth + 2); // + 2 for padding
    }

    const header = rows[0];
    let headerStr = '';
    for (let i = 0; i < (header?.length ?? 0); i++) {
        headerStr += `${colors.bright}${(header?.[i] ?? '').padEnd(
            colWidths[i] ?? 0
        )}${colors.reset}`;
    }
    console.log(headerStr);

    console.log(
        colors.gray +
            lineChar.repeat(colWidths.reduce((a, b) => a + b, 0)) +
            colors.reset
    );

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        let rowStr = '';
        for (let j = 0; j < (row?.length ?? 0); j++) {
            rowStr += (row?.[j] ?? '').padEnd(colWidths[j ?? 0] ?? 0);
        }
        console.log(rowStr);
    }
}
