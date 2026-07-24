import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

/**
 * Configuration options for the logger middleware.
 */
export interface LoggerOptions {
    /**
     * Whether to enable colorized output.
     * @default true
     */
    colors?: boolean;

    /**
     * Whether to log request headers.
     * @default false
     */
    logHeaders?: boolean;

    /**
     * Whether to log query parameters.
     * @default false
     */
    logQuery?: boolean;

    /**
     * Whether to log request body (for POST/PUT/PATCH requests).
     * ⚠️ WARNING: This will consume the request body stream, making it unavailable
     * to subsequent middleware or handlers. This is a limitation of the Web Streams API.
     * Only enable this for debugging purposes, not in production.
     * @default false
     */
    logBody?: boolean;

    /**
     * Custom log formatter function.
     * If provided, overrides the default logging format.
     *
     * @param info - Log information object
     * @returns Formatted log string
     */
    formatter?: (info: LogInfo) => string;

    /**
     * Custom log function.
     * By default, uses console.log. You can provide a custom function
     * to log to a file, external service, etc.
     *
     * @param message - The formatted log message
     */
    logFn?: (message: string) => void;

    /**
     * Skip logging for specific paths (e.g., health checks).
     * Can be a string, regex, or function.
     */
    skip?: string | RegExp | ((req: BurgerRequest) => boolean);
}

/**
 * Information passed to the log formatter.
 */
export interface LogInfo {
    method: string;
    url: string;
    path: string;
    status: number;
    duration: number;
    timestamp: string;
    headers?: Record<string, string>;
    query?: string;
    body?: any;
}

/**
 * ANSI color codes for terminal output.
 */
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Foreground colors
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

/**
 * Creates a logger middleware for request/response logging.
 *
 * This middleware logs HTTP requests with method, URL, status code, and response time.
 * It supports colorized output, custom formatting, and filtering.
 *
 * @param options - Configuration options for logging behavior
 * @returns A middleware function that logs requests and responses
 *
 * @example
 * ```typescript
 * // Basic usage with default settings
 * const logger = createLogger();
 *
 * // With custom options
 * const logger = createLogger({
 *   colors: true,
 *   logQuery: true,
 *   skip: '/health'
 * });
 *
 * // Custom formatter
 * const logger = createLogger({
 *   formatter: (info) => `[${info.timestamp}] ${info.method} ${info.path} - ${info.status} (${info.duration}ms)`
 * });
 *
 * // Log to file
 * const logger = createLogger({
 *   logFn: (message) => fs.appendFileSync('app.log', message + '\n')
 * });
 * ```
 */
export function createLogger(options: LoggerOptions = {}): Middleware {
    const {
        colors: useColors = true,
        logHeaders = false,
        logQuery = false,
        logBody = false,
        formatter = defaultFormatter,
        logFn = console.log,
        skip,
    } = options;

    return (req: BurgerRequest): BurgerNext => {
        // Check if we should skip logging for this request
        if (skip) {
            if (typeof skip === 'string' && req.url.includes(skip)) {
                return undefined;
            }
            if (skip instanceof RegExp && skip.test(req.url)) {
                return undefined;
            }
            if (typeof skip === 'function' && skip(req)) {
                return undefined;
            }
        }

        // Use Bun's high-precision nanosecond timer if available
        // Falls back to Date.now() for compatibility with other runtimes
        const startTime = typeof Bun !== 'undefined' && Bun.nanoseconds
            ? Bun.nanoseconds()
            : Date.now() * 1_000_000; // Convert to nanoseconds
        const method = req.method;
        const url = req.url;

        // Extract path and query from URL
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const query = urlObj.search;

        // Transform response to log after handler completes
        return async (response: Response): Promise<Response> => {
            // Calculate duration with high precision
            const endTime = typeof Bun !== 'undefined' && Bun.nanoseconds
                ? Bun.nanoseconds()
                : Date.now() * 1_000_000;
            const duration = Math.round((endTime - startTime) / 1_000_000); // Convert to milliseconds
            const status = response.status;
            const timestamp = new Date().toISOString();

            // Prepare log info
            const logInfo: LogInfo = {
                method,
                url,
                path,
                status,
                duration,
                timestamp,
            };

            // Add optional information
            if (logQuery && query) {
                logInfo.query = query;
            }

            if (logHeaders) {
                logInfo.headers = Object.fromEntries(req.headers.entries());
            }

            if (logBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
                try {
                    // Try to parse body if it's JSON
                    // Note: This consumes the request body stream
                    const contentType = req.headers.get('content-type');
                    if (contentType?.includes('application/json')) {
                        // Clone the request to avoid consuming the original body
                        const clonedReq = req.clone();
                        logInfo.body = await clonedReq.json();
                    }
                } catch {
                    // Ignore errors parsing body
                }
            }

            // Format and log the message
            const message = formatter(logInfo);
            const coloredMessage = useColors ? colorize(logInfo, message) : message;
            logFn(coloredMessage);

            return response;
        };
    };
}

/**
 * Default log formatter.
 */
function defaultFormatter(info: LogInfo): string {
    const parts = [
        `[${info.timestamp}]`,
        info.method,
        info.path,
        `${info.status}`,
        `${info.duration}ms`,
    ];

    if (info.query) {
        parts.push(info.query);
    }

    return parts.join(' ');
}

/**
 * Colorize the log message based on HTTP method and status code.
 */
function colorize(info: LogInfo, message: string): string {
    // Color the HTTP method
    let methodColor = colors.white;
    switch (info.method) {
        case 'GET':
            methodColor = colors.green;
            break;
        case 'POST':
            methodColor = colors.cyan;
            break;
        case 'PUT':
            methodColor = colors.yellow;
            break;
        case 'PATCH':
            methodColor = colors.magenta;
            break;
        case 'DELETE':
            methodColor = colors.red;
            break;
        case 'OPTIONS':
            methodColor = colors.gray;
            break;
    }

    // Color the status code
    let statusColor = colors.green;
    if (info.status >= 500) {
        statusColor = colors.red + colors.bright;
    } else if (info.status >= 400) {
        statusColor = colors.yellow;
    } else if (info.status >= 300) {
        statusColor = colors.cyan;
    } else if (info.status >= 200) {
        statusColor = colors.green;
    }

    // Build colorized message
    const parts = message.split(' ');
    const colorizedParts: string[] = [];

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // Timestamp (gray)
        if (part.startsWith('[') && part.endsWith(']')) {
            colorizedParts.push(colors.gray + part + colors.reset);
        }
        // HTTP Method
        else if (part === info.method) {
            colorizedParts.push(methodColor + colors.bright + part + colors.reset);
        }
        // Status code
        else if (part === info.status.toString()) {
            colorizedParts.push(statusColor + part + colors.reset);
        }
        // Duration (dim)
        else if (part.endsWith('ms')) {
            colorizedParts.push(colors.dim + part + colors.reset);
        }
        // Default
        else {
            colorizedParts.push(part);
        }
    }

    return colorizedParts.join(' ');
}

/**
 * Convenience function: Simple logger with default settings.
 *
 * @example
 * ```typescript
 * // api/hooks.ts
 * import { logger } from 'burger-api/middleware/logger';
 *
 * export const beforeHandle = [logger()];
 * ```
 */
export function logger(): Middleware {
    return createLogger();
}

