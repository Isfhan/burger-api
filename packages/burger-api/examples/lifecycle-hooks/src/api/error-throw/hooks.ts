// Two onError handlers in the same route.
// First throws, second catches — demonstrates onError fallthrough within a route.
export const onError = [
    () => {
        throw new Error('onError-threw');
    },
    (error: Error) =>
        new Response(
            JSON.stringify({ handled: 'route', message: error.message }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
];
