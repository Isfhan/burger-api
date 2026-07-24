export const beforeHandle = [
    (req: any) => {
        req._globalHookRan = true;
    },
];

export const provide = {
    globalProvide: () => 'from-global-hooks',
};
