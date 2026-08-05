export const beforeRoute = [
    () =>
        new Response('blocked by global hooks', {
            status: 418,
        }),
];
