import type { BurgerContext } from 'burger-api';

export default async function GET(ctx: BurgerContext): Promise<Response> {
    const slug = (ctx.params as Record<string, string>)?.slug ?? 'unknown';
    return new Response(
        `<!doctype html><html><body><h1>Blog: ${slug}</h1><p>Dynamic page via TSX handler.</p></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
    );
}
