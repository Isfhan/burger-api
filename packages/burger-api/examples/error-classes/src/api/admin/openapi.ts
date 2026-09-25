export const GET = {
    summary: 'Admin panel (requires auth)',
    tags: ['admin'],
    responses: {
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden' },
    },
};
