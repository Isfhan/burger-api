export const beforeRoute = [
    (req: any) => {
        req._globalHookRan = true;
    },
];

export const transform = {
    globalProvide: () => 'from-global-hooks',
};
