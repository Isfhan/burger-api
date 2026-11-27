/** A port the OS reports as free right now, so tests never pick a busy one. */
export function freePort(): number {
    const probe = Bun.serve({ port: 0, fetch: () => new Response(null) });
    const port = probe.port as number;
    probe.stop(true);
    return port;
}
