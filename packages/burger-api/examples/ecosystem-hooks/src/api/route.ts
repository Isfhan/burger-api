export async function GET() {
    return Response.json({
        message: 'All ecosystem hooks are active',
        hooks: [
            'cors',
            'logger',
            'rate-limiter',
            'compression',
            'security-headers',
            'timeout',
            'body-size-limiter',
            'cache (no-cache)',
        ],
    });
}
