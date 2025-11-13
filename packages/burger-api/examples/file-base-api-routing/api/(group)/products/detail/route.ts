// This is data is outside of the route handler
// but you can access it in the route handler
const productId = '123';

export function GET() {
    return Response.json({
        message: 'Product Detail',
        productId,
    });
}
