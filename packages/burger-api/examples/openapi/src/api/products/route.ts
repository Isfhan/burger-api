import { defineRoute } from 'burger-api';
import { POST as PostSchema } from './schema';

export const POST = defineRoute(PostSchema, (ctx) => {
    console.log('[POST] Products route invoked');
    return Response.json(ctx.validated.body);
});
