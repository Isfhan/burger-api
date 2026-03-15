import { normalizePath } from './index';

/**
 * Generates an HTTP error response based on the request's "Accept" header.
 *
 * If the "Accept" header includes "text/html" and debugging is enabled, it returns
 * an HTML response with the error message and stack trace.
 *
 * If the "Accept" header includes "application/json" or debugging is enabled, it
 * returns a JSON response with the error message and optionally the stack trace.
 *
 * Otherwise, it returns a plain text response indicating an internal server error.
 *
 * @param error - The error object or message to include in the response.
 * @param req - The incoming HTTP request object.
 * @param debug - A boolean indicating whether debugging information should be included.
 * @returns A Response object with the appropriate error details and status code.
 */
export function errorResponse(
    error: unknown,
    req: Request,
    debug: boolean
): Response {
    // Extract request details
    const method = req.method;
    const url = req.url;
    const logPrefix = `[${method} ${url}]`;

    // Log detailed error context
    console.error(`${logPrefix} Error:`, error);

    const message =
        error instanceof Error
            ? error.message
            : String(error ?? 'Unknown error');
    const stack =
        error instanceof Error
            ? (error.stack ?? 'No stack trace available')
            : '';
    const tagLabel = stack ? stack.split('\n')[0].split(':')[0] : 'Error';

    const acceptHeader = req.headers.get('accept') || '';
    if (acceptHeader.includes('text/html') && debug) {
        const body = `<!doctype html><html lang="en"><meta charset="UTF-8"><title>Error Occurred - BurgerAPI</title><style>body{margin:0;padding:0;background-color:#f4f4f4;font-family:Nunito,sans-serif;color:#333}.whoops-container{width:80%;margin:5% auto;background:#fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);overflow:hidden}.whoops-header{background-color:#e74c3c;color:#fff;padding:20px;display:flex;align-items:center;justify-content:space-between}.whoops-header .title-container{display:flex;align-items:center}.whoops-header .title{font-size:1.5em;margin-left:10px}.whoops-header .debug-mode{font-weight:600;display:flex;align-items:center;padding:10px;background-color:#fff;color:#e74c3c;box-shadow:0 4px 12px rgba(0,0,0,.15);border-radius:8px}.whoops-header .debug-mode .fa-check-circle{color:#28a745;margin-right:5px;font-size:1.2em}.whoops-content{padding:2em}.tag{font-weight:600;color:#4a5568;background-color:#edf2f7;padding:8px 15px;border-radius:6px;display:inline-block;font-size:14px}.error-message{font-size:1.25em;line-height:1.6;margin-bottom:1.5em;color:#2d3748}h2{color:#e3342f;font-size:1.5em;margin-bottom:.8em;border-bottom:1px solid #edf2f7;padding-bottom:.5em}pre{background:#f9fafc;border-left:4px solid #e3342f;padding:1.5em;border-radius:4px;font-family:"Source Code Pro",Menlo,Monaco,Consolas,"Courier New",monospace;font-size:1em;line-height:1.6;overflow-x:auto;color:#4a5568}.footer{text-align:center;padding-top:25px;font-size:.9em;color:#718096;border-top:1px solid #edf2f7}.error-icon{font-size:2em}.request-info{display:flex;justify-content:space-between;align-items:center}</style><link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css"rel="stylesheet"><div class="whoops-container"><div class="whoops-header"><div class="title-container"><i class="fas error-icon fa-exclamation-triangle"></i><div class="title">Whoops! Something went wrong</div></div><div class="debug-mode"><i class="fas fa-check-circle"></i> Debug Mode Enabled</div></div><div class="whoops-content"><div class="request-info"><div><strong>Request:</strong> ${method} ${url}</div><div class="tag">${tagLabel}</div></div><p class="error-message">${message}</p><h2>Stack Trace</h2><pre>${stack}</pre><div class="footer">“It’s not a bug, it’s an undocumented feature.” — Anonymous</div></div></div>
       `;

        // Return the html response
        return new Response(body, {
            status: 500,
            headers: { 'Content-Type': 'text/html' },
        });
    } else if (debug) {
        // Log detailed error context
        console.error(`${logPrefix} Error:`, error);

        // Create a JSON response
        const body = JSON.stringify({
            request: `${method} ${url}`,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack:
                error instanceof Error ? normalizePath(error.stack || '') : '',
        });

        // Return the JSON response
        return new Response(body, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    } else {
        // Log detailed error context
        console.error(`${logPrefix} Error:`, error);

        // Return a plain text response
        return new Response('Internal Server Error', { status: 500 });
    }
}
