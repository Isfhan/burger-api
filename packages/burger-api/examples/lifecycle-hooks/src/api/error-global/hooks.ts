// Self-contained: this route now defines its own onError handler.
// Previously relied on global-tier inheritance; now explicit.
export const onError = (error: Error) =>
    new Response(
        JSON.stringify({ handled: 'global', message: error.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
