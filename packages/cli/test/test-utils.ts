import { createServer } from 'net';

/**
 * Allocates an available port on 127.0.0.1 by binding a server to 0
 * and reading the assigned port. Safe for parallel test runs.
 */
export async function getAvailablePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Failed to allocate a test port.'));
                return;
            }
            const { port } = address;
            server.close((closeErr) => {
                if (closeErr) {
                    reject(closeErr);
                    return;
                }
                resolve(port);
            });
        });
    });
}
