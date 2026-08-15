import type { BurgerContext, BurgerNext } from 'burger-api';

/**
 * Configuration options for the logger hook.
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
     * to subsequent hooks or handlers. This is a limitation of the Web Streams API.
     * Only enable this for debugging purposes, not in production.
     * @default false
     */
    logBody?: boolean;

    /**
     * Whether to generate and include request IDs in logs.
     * @default true
     */
    requestId?: boolean;

    /**
     * Header name to check for existing request ID (e.g., from upstream proxy).
     * If provided, uses existing ID from header; otherwise generates new one.
     * @default "X-Request-ID"
     */
    requestIdHeader?: string;

    /**
     * Whether to include request ID in log output.
     * @default true
     */
    includeRequestIdInLog?: boolean;

    /**
     * Output format.
     * - "text": Human-readable text format
     * - "json": Structured JSON format
     * @default "text"
     */
    format?: "text" | "json";

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
    skip?: string | RegExp | ((ctx: BurgerContext) => boolean);
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
    requestId?: string;
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
 * Creates a logger hook for request/response logging.
 *
 * This hook logs HTTP requests with method, URL, status code, and response time.
 * It supports colorized output, custom formatting, and filtering.
 *
 * @param options - Configuration options for logging behavior
 * @returns A hook function that logs requests and responses
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
 * // With request IDs
 * const logger = createLogger({
 *   requestId: true,
 *   requestIdHeader: 'X-Request-ID',
 * });
 *
 * // JSON format
 * const logger = createLogger({
 *   format: 'json',
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
export function createLogger(options: LoggerOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        colors: useColors = true,
        logHeaders = false,
        logQuery = false,
        logBody = false,
        requestId: enableRequestId = true,
        requestIdHeader = 'X-Request-ID',
        includeRequestIdInLog = true,
        format = 'text',
        formatter = format === 'json' ? jsonFormatter : defaultFormatter,
        logFn = console.log,
        skip,
    } = options;

    return (ctx: BurgerContext): BurgerNext => {
        // Check if we should skip logging for this request
        if (skip) {
            if (typeof skip === 'string' && ctx.url.includes(skip)) {
                return undefined;
            }
            if (skip instanceof RegExp && skip.test(ctx.url)) {
                return undefined;
            }
            if (typeof skip === 'function' && skip(ctx)) {
                return undefined;
            }
        }

        // Use Bun's high-precision nanosecond timer if available
        // Falls back to Date.now() for compatibility with other runtimes
        const startTime = typeof Bun !== 'undefined' && Bun.nanoseconds
            ? Bun.nanoseconds()
            : Date.now() * 1_000_000; // Convert to nanoseconds
        const method = ctx.method;
        const url = ctx.url;

        // Extract path and query from URL
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const query = urlObj.search;

        // Generate or extract request ID
        let requestId: string | undefined;
        if (enableRequestId) {
            // Check for existing request ID in header
            const existingId = ctx.headers.get(requestIdHeader);
            if (existingId) {
                requestId = existingId;
            } else {
                // Generate new UUID
                requestId = crypto.randomUUID();
            }

            // Attach to context for use in handlers
            (ctx as { requestId?: string }).requestId = requestId;
        }

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
                requestId: includeRequestIdInLog ? requestId : undefined,
            };

            // Add optional information
            if (logQuery && query) {
                logInfo.query = query;
            }

            if (logHeaders) {
                logInfo.headers = Object.fromEntries(ctx.headers as any);
            }

            if (logBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
                try {
                    // Try to parse body if it's JSON
                    // Note: This consumes the request body stream
                    const contentType = ctx.headers.get('content-type');
                    if (contentType?.includes('application/json')) {
                        // Clone the request to avoid consuming the original body
                        const clonedReq = ctx.clone();
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
    ];

    // Add request ID if available
    if (info.requestId) {
        parts.push(`[${info.requestId}]`);
    }

    parts.push(
        info.method,
        info.path,
        `${info.status}`,
        `${info.duration}ms`
    );

    if (info.query) {
        parts.push(info.query);
    }

    return parts.join(' ');
}

/**
 * JSON log formatter.
 */
function jsonFormatter(info: LogInfo): string {
    const logObject: Record<string, unknown> = {
        timestamp: info.timestamp,
        method: info.method,
        path: info.path,
        status: info.status,
        duration: info.duration,
    };

    if (info.requestId) {
        logObject.requestId = info.requestId;
    }

    if (info.query) {
        logObject.query = info.query;
    }

    if (info.headers) {
        logObject.headers = info.headers;
    }

    if (info.body !== undefined) {
        logObject.body = info.body;
    }

    return JSON.stringify(logObject);
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
        const part = parts[i]!;
        
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
 * import { logger } from '../ecosystem/hooks/logger/logger';
 *
 * export const beforeRoute = [logger()];
 * ```
 */
export function logger(): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return createLogger();
}

