/**
 * Beautiful Console Output
 *
 * Makes the CLI look nice with colors and symbols.
 * Uses standard ANSI codes that work in all terminals.
 * Automatically falls back to ASCII on older Windows terminals.
 *
 * No dependencies needed - just plain JavaScript!
 */

/**
 * Detect if the terminal supports Unicode symbols
 * Returns false for Windows CMD and older PowerShell to use ASCII fallbacks
 */
function supportsUnicode(): boolean {
    // Check if we're on Windows
    if (process.platform !== 'win32') {
        return true; // macOS and Linux support Unicode
    }

    // Check for Windows Terminal (supports Unicode)
    if (process.env.WT_SESSION) {
        return true;
    }

    // Check for VS Code terminal (supports Unicode)
    if (process.env.TERM_PROGRAM === 'vscode') {
        return true;
    }

    // Check for ConEmu/Cmder (supports Unicode)
    if (process.env.ConEmuANSI === 'ON') {
        return true;
    }

    // Check for modern terminal emulators
    if (process.env.TERM && process.env.TERM !== 'dumb') {
        return true;
    }

    // Check for CI environments (usually support Unicode)
    if (process.env.CI) {
        return true;
    }

    // Default to ASCII for Windows CMD and older PowerShell
    return false;
}

/**
 * ANSI color codes for terminal output
 * These are special character sequences that tell the terminal to change colors
 */
const colors = {
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
 * Unicode symbols for modern terminals
 */
const unicodeSymbols = {
    success: '[OK]',
    error: '[X]',
    info: '[i]',
    warning: '[!]',
    arrow: '[->]',
    bullet: '[•]',
    star: '[★]',
};

/**
 * ASCII fallback symbols for older Windows terminals (CMD, older PowerShell)
 */
const asciiSymbols = {
    success: '[OK]',
    error: '[X]',
    info: '[i]',
    warning: '[!]',
    arrow: '[->]',
    bullet: '•',
    star: '[*]',
};

/**
 * Pretty symbols for different message types
 * Automatically uses ASCII fallbacks on older Windows terminals
 */
const symbols = supportsUnicode() ? unicodeSymbols : asciiSymbols;

/**
 * Show a success message (green with checkmark)
 * Use this when something completes successfully
 *
 * @param message - The message to display
 * @example
 * success('Project created successfully!')
 */
export function success(message: string): void {
    console.log(`${colors.green}${symbols.success}${colors.reset} ${message}`);
}

/**
 * Show an error message (red with X)
 * Use this when something goes wrong
 *
 * @param message - The error message to display
 * @example
 * error('Failed to download file')
 */
export function error(message: string): void {
    console.log(`${colors.red}${symbols.error}${colors.reset} ${message}`);
}

/**
 * Show an info message (blue with info symbol)
 * Use this for general information
 *
 * @param message - The info message to display
 * @example
 * info('Downloading templates...')
 */
export function info(message: string): void {
    console.log(`${colors.blue}${symbols.info}${colors.reset} ${message}`);
}

/**
 * Show a warning message (yellow with warning symbol)
 * Use this for warnings that aren't errors
 *
 * @param message - The warning message to display
 * @example
 * warning('This will overwrite existing files')
 */
export function warning(message: string): void {
    console.log(`${colors.yellow}${symbols.warning}${colors.reset} ${message}`);
}

/**
 * Show a message with an arrow
 * Useful for showing steps or progress
 *
 * @param message - The message to display
 * @example
 * step('Installing dependencies...')
 */
export function step(message: string): void {
    console.log(`${colors.cyan}${symbols.arrow}${colors.reset} ${message}`);
}

/**
 * Return a highlighted string (bold and bright)
 * Use this for important text that needs attention
 *
 * @param message - The message to highlight
 * @returns Formatted string with ANSI codes
 * @example
 * console.log(`Visit ${highlight('http://localhost:4000')}`);
 */
export function highlight(message: string): string {
    return `${colors.bright}${message}${colors.reset}`;
}

/**
 * Show a dimmed message (gray and dim)
 * Use this for less important information
 *
 * @param message - The message to dim
 * @example
 * dim('You can skip this step if you want')
 */
export function dim(message: string): void {
    console.log(`${colors.gray}${colors.dim}${message}${colors.reset}`);
}

/**
 * Show a message with a bullet point
 * Useful for lists
 *
 * @param message - The message to display
 * @example
 * bullet('CORS middleware')
 */
export function bullet(message: string): void {
    console.log(`  ${colors.gray}${symbols.bullet}${colors.reset} ${message}`);
}

/**
 * Print a blank line
 * Helps with spacing and readability
 */
export function newline(): void {
    console.log();
}

/**
 * Get the line character based on terminal support
 */
const lineChar = supportsUnicode() ? '─' : '-';

/**
 * Print a horizontal line separator
 * Use this to separate sections
 *
 * @example
 * separator()
 */
export function separator(): void {
    console.log(colors.gray + lineChar.repeat(50) + colors.reset);
}

/**
 * Print a header with a title
 * Makes sections stand out
 *
 * @param title - The header title
 * @example
 * header('Available Middleware')
 */
export function header(title: string): void {
    newline();
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(colors.gray + lineChar.repeat(title.length) + colors.reset);
    newline();
}

/**
 * Show a command that the user can run
 * Displays it in a nice format
 *
 * @param command - The command to display
 * @example
 * command('bun install')
 */
export function command(command: string): void {
    console.log(
        `  ${colors.dim}$${colors.reset} ${colors.cyan}${command}${colors.reset}`
    );
}

/**
 * Show code or file content
 * Displays it in a monospace-looking format
 *
 * @param code - The code to display
 * @example
 * code('import { Burger } from "burger-api"')
 */
export function code(code: string): void {
    console.log(`  ${colors.gray}${code}${colors.reset}`);
}

/**
 * Spinner frames - Unicode for modern terminals, ASCII for CMD
 */
const spinnerFrames = supportsUnicode()
    ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    : ['|', '/', '-', '\\'];

/**
 * Simple spinner class for showing progress
 * Shows an animated spinner while something is loading
 *
 * @example
 * const spin = spinner('Downloading...');
 * // do some work
 * spin.stop('Done!');
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

    /**
     * Start the spinner animation
     */
    private start(): void {
        // Hide cursor
        process.stdout.write('\x1B[?25l');

        // Show first frame
        this.render();

        // Update every 80ms for smooth animation
        this.intervalId = setInterval(() => {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.render();
        }, 80);
    }

    /**
     * Render the current frame
     */
    private render(): void {
        // Clear the line and move cursor to beginning
        process.stdout.write('\r\x1B[K');
        // Write the spinner and message
        process.stdout.write(
            `${colors.cyan}${this.frames[this.currentFrame]}${colors.reset} ${
                this.message
            }`
        );
    }

    /**
     * Update the spinner message
     *
     * @param message - New message to display
     */
    update(message: string): void {
        this.message = message;
        this.render();
    }

    /**
     * Stop the spinner and show final message
     *
     * @param finalMessage - Optional message to show when done
     * @param isError - Whether this is an error (shows X instead of checkmark)
     */
    stop(finalMessage?: string, isError = false): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Clear the spinner line
        process.stdout.write('\r\x1B[K');

        // Show cursor again
        process.stdout.write('\x1B[?25h');

        // Show final message if provided
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
 * Create and return a new spinner
 * This is a helper function to make it easier to use
 *
 * @param message - The message to display while spinning
 * @returns A Spinner instance
 * @example
 * const spin = spinner('Loading...');
 * await doSomething();
 * spin.stop('Done!');
 */
export function spinner(message: string): Spinner {
    return new Spinner(message);
}

/**
 * Format a file size in a human-readable way
 * Converts bytes to KB, MB, etc.
 *
 * @param bytes - Size in bytes
 * @returns Formatted string like "1.5 MB"
 * @example
 * formatSize(1500000) // "1.43 MB"
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
╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝ ╚═╝╚═╝   ╚═╝╚═╝     ╚═╝
                                    CLI tool for BurgerAPI projects - v0.1.0                                            
`.trim();

/**
 * Show ASCII art banner for BurgerAPI CLI
 * Displays when CLI starts
 * Uses ASCII-safe characters for Windows CMD compatibility
 */
export function showBanner(): void {
    const bannerColor = '\x1b[38;2;255;204;153m'; // Warm orange color

    const reset = '\x1b[0m';

    // Unicode banner for modern terminals
    console.log(`${bannerColor}
${LOGO_TEXT}    
                                                                                                 
${reset}`);
}

/**
 * Create a simple table for displaying data
 *
 * @param rows - Array of row data
 * @example
 * table([
 *   ['Name', 'Version'],
 *   ['burger-api', '0.6.2'],
 *   ['bun', '1.3.1']
 * ]);
 */
export function table(rows: string[][]): void {
    if (rows.length === 0) return;

    // Calculate column widths
    const colWidths: number[] = [];
    for (let col = 0; col < (rows[0]?.length ?? 0); col++) {
        let maxWidth = 0;
        for (const row of rows) {
            if (row[col]?.length && (row[col]?.length ?? 0) > maxWidth) {
                maxWidth = row[col]?.length ?? 0;
            }
        }
        colWidths.push(maxWidth + 2); // Add padding
    }

    // Print header (first row) with different styling
    const header = rows[0];
    let headerStr = '';
    for (let i = 0; i < (header?.length ?? 0); i++) {
        headerStr += `${colors.bright}${(header?.[i] ?? '').padEnd(
            colWidths[i] ?? 0
        )}${colors.reset}`;
    }
    console.log(headerStr);

    // Print separator
    console.log(
        colors.gray +
            lineChar.repeat(colWidths.reduce((a, b) => a + b, 0)) +
            colors.reset
    );

    // Print data rows
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        let rowStr = '';
        for (let j = 0; j < (row?.length ?? 0); j++) {
            rowStr += (row?.[j] ?? '').padEnd(colWidths[j ?? 0] ?? 0);
        }
        console.log(rowStr);
    }
}
