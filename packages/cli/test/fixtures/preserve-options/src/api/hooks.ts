export const beforeRoute = [
    () =>
        new Response('blocked by global middleware', {
            status: 418,
        }),
];
