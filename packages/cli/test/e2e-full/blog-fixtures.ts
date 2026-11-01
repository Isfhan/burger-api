/**
 * Fixture app written over the generated `blog-ts` scaffold: a real,
 * in-memory posts API with JWT auth, providers, hooks, and a WebSocket
 * comments route. Every file is registered through the CLI conventions.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

function write(dir: string, relPath: string, content: string): void {
    const target = join(dir, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
}

export function writeBlogApp(dir: string): void {
    write(
        dir,
        'src/plugins.ts',
        `import type { PluginRegistrar } from 'burger-api';
import { jwtAuth } from '../ecosystem/plugins/jwt-auth/jwt-auth';

export default (burger: PluginRegistrar) => {
    burger.usePlugin(jwtAuth({ secret: process.env.JWT_SECRET }));
};
`
    );

    write(
        dir,
        'src/providers.ts',
        `import type { ProviderRegistrar } from 'burger-api';

export interface NewPost {
    title: string;
    body: string;
}

export interface Post extends NewPost {
    id: string;
}

export default (burger: ProviderRegistrar) => {
    const posts = new Map<string, Post>();
    let nextId = 0;

    burger.provide('posts', {
        list: (): Post[] => [...posts.values()],
        get: (id: string): Post | undefined => posts.get(id),
        create: (input: NewPost): Post => {
            const post: Post = { id: String(++nextId), ...input };
            posts.set(post.id, post);
            return post;
        },
    });
};
`
    );

    write(
        dir,
        'src/types.ts',
        `import type { NewPost, Post } from './providers';

declare module 'burger-api' {
    interface BurgerServices {
        posts: {
            list(): Post[];
            get(id: string): Post | undefined;
            create(input: NewPost): Post;
        };
    }
}

export {};
`
    );

    write(
        dir,
        'src/hooks.ts',
        `import type { GlobalHooks } from 'burger-api';
import { cors } from '../ecosystem/hooks/cors/cors';
import { logger } from '../ecosystem/hooks/logger/logger';
import { requestId } from '../ecosystem/hooks/request-id/request-id';

export const onRequest: GlobalHooks['onRequest'] = [cors()];

export const beforeRoute: GlobalHooks['beforeRoute'] = [requestId(), logger()];
`
    );

    write(
        dir,
        'src/api/posts/route.ts',
        `import { defineRoute } from 'burger-api';
import type { BurgerContext } from 'burger-api';
import { POST as PostSchema } from './schema';

export function GET(ctx: BurgerContext): Response {
    return Response.json({ posts: ctx.services.posts.list() });
}

export const POST = defineRoute(PostSchema, (ctx) => {
    const post = ctx.services.posts.create(ctx.validated.body);
    ctx.publish(\`comments:\${post.id}\`, JSON.stringify({ type: 'post', post }));
    return Response.json(post, { status: 201 });
});
`
    );

    write(
        dir,
        'src/api/posts/schema.ts',
        `import { z } from 'zod';
import type { MethodSchema } from 'burger-api';

export const POST = {
    body: z.object({
        title: z.string().min(1),
        body: z.string().min(1),
    }),
} satisfies MethodSchema;
`
    );

    write(
        dir,
        'src/api/posts/config.ts',
        `import type { RouteConfig } from 'burger-api';

export default {
    auth: false,
} satisfies RouteConfig;
export const POST = { auth: { required: true } };
`
    );

    write(
        dir,
        'src/api/posts/[id]/route.ts',
        `import { defineRoute } from 'burger-api';
import { GET as GetSchema } from './schema';

export const GET = defineRoute(GetSchema, (ctx) => {
    const post = ctx.services.posts.get(ctx.validated.params.id);
    if (!post) {
        return Response.json({ error: 'Post not found' }, { status: 404 });
    }
    return Response.json(post);
});
`
    );

    write(
        dir,
        'src/api/auth/login/route.ts',
        `import { defineRoute } from 'burger-api';
import { POST as PostSchema } from './schema';
import { signJwt } from '../../../../ecosystem/plugins/jwt-auth/jwt-auth';

export const POST = defineRoute(PostSchema, async (ctx) => {
    const { username, password } = ctx.validated.body;
    if (username !== 'admin' || password !== 'secret') {
        return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const token = await signJwt(
        { sub: 'admin' },
        { secret: process.env.JWT_SECRET!, expiresIn: 3600 }
    );
    return Response.json({ token });
});
`
    );

    write(
        dir,
        'src/api/auth/login/schema.ts',
        `import { z } from 'zod';
import type { MethodSchema } from 'burger-api';

export const POST = {
    body: z.object({
        username: z.string().min(1),
        password: z.string().min(1),
    }),
} satisfies MethodSchema;
`
    );

    write(
        dir,
        'src/websocket/comments/ws.ts',
        `import type { BurgerWS } from 'burger-api';

export function open(ws: BurgerWS) {
    const postId = ws.query.get('postId') ?? '';
    ws.subscribe(\`comments:\${postId}\`);
    ws.send(JSON.stringify({ type: 'subscribed', postId }));
}

export function message(ws: BurgerWS, message: string | Buffer) {
    ws.send(message);
}

export function close(ws: BurgerWS, code: number, reason: string) {
    ws.unsubscribe(\`comments:\${ws.query.get('postId') ?? ''}\`);
}
`
    );

    write(
        dir,
        'src/websocket/comments/config.ts',
        `import type { WebSocketConfig } from 'burger-api';

export default {
    auth: false,
} satisfies WebSocketConfig;
`
    );
}
