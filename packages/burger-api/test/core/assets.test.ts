import { describe, it, expect, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    contentTypeFor,
    collectDiskAssetRoutes,
    diskAssetHandler,
    embeddedAssetHandler,
} from '../../src/core/assets';

// OS temp dir (mkdtemp-style), never the repo tree — a crashed test run must
// not leave untracked `.tmp-*` noise in `git status`.
const tmp = join(
    tmpdir(),
    `burger-assets-test-${process.pid}-${Date.now().toString(36)}`
);

afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
});

function makeAssets(): string {
    const pageDir = `${tmp}/pages`;
    mkdirSync(`${pageDir}/assets/nested`, { recursive: true });
    writeFileSync(`${pageDir}/assets/style.css`, 'body{}');
    writeFileSync(`${pageDir}/assets/app.js`, 'console.log(1)');
    writeFileSync(`${pageDir}/assets/logo.svg`, '<svg/>');
    writeFileSync(`${pageDir}/assets/nested/icon.png`, 'PNGDATA');
    return pageDir;
}

describe('static assets', () => {
    it('maps extensions to content types', () => {
        expect(contentTypeFor('a.css')).toBe('text/css; charset=utf-8');
        expect(contentTypeFor('b.JS')).toBe('text/javascript; charset=utf-8');
        expect(contentTypeFor('c.svg')).toBe('image/svg+xml');
        expect(contentTypeFor('d.unknownext')).toBe(
            'application/octet-stream'
        );
    });

    it('collects disk assets recursively with route paths', async () => {
        const pageDir = makeAssets();
        const routes = await collectDiskAssetRoutes(pageDir);
        const paths = routes.map((r) => r.routePath);
        expect(paths).toContain('/assets/style.css');
        expect(paths).toContain('/assets/app.js');
        expect(paths).toContain('/assets/logo.svg');
        expect(paths).toContain('/assets/nested/icon.png');
        const css = routes.find((r) => r.routePath === '/assets/style.css')!;
        expect(css.contentType).toBe('text/css; charset=utf-8');
    });

    it('returns [] when the assets dir is absent', async () => {
        const routes = await collectDiskAssetRoutes('./.tmp-nope');
        expect(routes).toEqual([]);
    });

    it('disk handler serves the file with its content type', async () => {
        const pageDir = makeAssets();
        const [route] = await collectDiskAssetRoutes(pageDir).then((r) =>
            r.filter((x) => x.routePath === '/assets/style.css')
        );
        const res = await diskAssetHandler(route!)({} as never);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
        expect(await res.text()).toBe('body{}');
    });

    it('disk handler 404s when the file vanished', async () => {
        const res = await diskAssetHandler({
            routePath: '/assets/gone.css',
            file: `${tmp}/does-not-exist.css`,
            contentType: 'text/css',
        })({} as never);
        expect(res.status).toBe(404);
    });

    it('embedded handler decodes text and binary payloads', async () => {
        const textRes = await embeddedAssetHandler({
            path: '/assets/style.css',
            contentType: 'text/css; charset=utf-8',
            data: Buffer.from('body{}').toString('base64'),
        })({} as never);
        expect(textRes.headers.get('Content-Type')).toBe(
            'text/css; charset=utf-8'
        );
        expect(await textRes.text()).toBe('body{}');

        const binRes = await embeddedAssetHandler({
            path: '/assets/nested/icon.png',
            contentType: 'image/png',
            data: Buffer.from('PNGDATA').toString('base64'),
        })({} as never);
        expect(binRes.headers.get('Content-Type')).toBe('image/png');
        expect(
            new TextDecoder().decode(await binRes.arrayBuffer())
        ).toBe('PNGDATA');
    });
});
