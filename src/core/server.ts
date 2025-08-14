// Import stuff from Bun
import { serve } from 'bun';

// Import stuff from utils
import { errorResponse } from '@utils/error.js';

import type { ServerOptions, FetchHandler } from '@burgerTypes';

export class Server {
    private options: ServerOptions;
    private server: ReturnType<typeof serve> | null = null;

    /**
     * Initializes a new instance of the Server class with the given options.
     * @param options - Configuration options for the server.
     */
    constructor(options: ServerOptions) {
        this.options = options;
    }

    public start(
        routes: { [key: string]: any } | undefined,
        handler: FetchHandler,
        port: number,
        cb?: () => void
    ): void {
        // Start Bun's native server using Bun.serve
        this.server = serve({
            routes,
            // Bun's fetch handler
            fetch: async (request: Request) => {
                try {
                    return await handler(request);
                } catch (error) {
                    // Return a custom error response
                    return errorResponse(
                        error,
                        request,
                        this.options.debug ?? false
                    );
                }
            },
            // Global error handler
            error(error) {
                console.error(error);
                return new Response(`Internal Server Error: ${error.message}`, {
                    status: 500,
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                });
            },
            port,
        });
        if (cb) {
            cb();
        } else {
            console.log(
                `🍔 BurgerAPI is running at: http://${
                    this.options.hostname || 'localhost'
                }:${port}`
            );
        }
    }

    /**
     * Stops the server.
     * If the server is currently running, this method will stop the server and
     * log a message to the console indicating that the server has been stopped.
     * If the server is not running, this method does nothing.
     */
    public stop(): void {
        if (this.server) {
            this.server.stop();
            console.log('Server stopped.');
        }
    }
}
