import { defineRoute } from 'burger-api';
import { GET as GetSchema, POST as PostSchema } from './schema';

export const GET = defineRoute(GetSchema, (ctx) => {
    return Response.json({
        query: ctx.validated.query,
        name: 'John Doe',
    });
});

export const POST = defineRoute(PostSchema, (ctx) => {
    return Response.json(ctx.validated.body);
});
