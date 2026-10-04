export const GET = {
    summary: 'Get a Test',
    description: 'Gets a test message.',
    tags: ['Test'],
    operationId: 'getTest',
};

export const POST = {
    summary: 'Create a Test',
    description:
        'Creates a new test message. Requires name and price in the request body.',
    tags: ['Test'],
    operationId: 'createTest',
};
