export const beforeHandle = [
    () =>
        new Response('blocked by global middleware', {
            status: 418,
        }),
];
