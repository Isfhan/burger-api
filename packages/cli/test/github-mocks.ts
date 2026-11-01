/**
 * In-memory GitHub fetch mocks shared by the add/skills flow tests: the
 * commands talk to the real downloader code, only `fetch` is faked.
 */

/** A fake ecosystem package as a file name -> content map. */
export interface FakePackage {
    files: Record<string, string>;
}

/** A fake ecosystem repo with hooks and plugins. */
export interface FakeRepo {
    hooks: Record<string, FakePackage>;
    plugins: Record<string, FakePackage>;
}

/** Serves the two GitHub endpoints `add` uses from an in-memory repo. */
export function githubMock(
    repo: FakeRepo,
    overrides: {
        /** Path -> successful contents hits allowed before a 500. */
        failContentsAfter?: Record<string, number>;
        /** Repo-relative raw paths whose download returns 500. */
        failRaw?: (repoPath: string) => boolean;
    } = {}
): (input: string | URL | Request) => Response {
    const rawBase = 'https://raw.githubusercontent.com/isfhan/burger-api/x';
    const contentsHits = new Map<string, number>();
    return (input: string | URL | Request): Response => {
        const url = new URL(String(input));
        const contents = url.pathname.match(/\/contents\/(.+)$/);
        if (contents) {
            const repoPath = decodeURIComponent(contents[1]!);
            const allowed = overrides.failContentsAfter?.[repoPath];
            if (allowed !== undefined) {
                const hits = contentsHits.get(repoPath) ?? 0;
                contentsHits.set(repoPath, hits + 1);
                if (hits >= allowed) {
                    return new Response(JSON.stringify({ message: 'boom' }), {
                        status: 500,
                    });
                }
            }
            const [, kind, name] = repoPath.split('/');
            const pkg = repo[kind as 'hooks' | 'plugins']?.[name!];
            if (!pkg) return new Response('not found', { status: 404 });
            return Response.json(
                Object.entries(pkg.files).map(([fileName, content]) => ({
                    name: fileName,
                    path: `${repoPath}/${fileName}`,
                    type: 'file',
                    download_url: `${rawBase}/${repoPath}/${fileName}`,
                    size: content.length,
                }))
            );
        }

        const raw = url.pathname.match(/\/ecosystem\/(.+)$/);
        if (raw) {
            if (overrides.failRaw?.(raw[1]!)) {
                return new Response('server error', { status: 500 });
            }
            const [kind, name, ...fileParts] = raw[1]!.split('/');
            const content =
                repo[kind as 'hooks' | 'plugins']?.[name!]?.files[
                    fileParts.join('/')
                ];
            if (content === undefined) {
                return new Response('not found', { status: 404 });
            }
            return new Response(content);
        }

        return new Response(`unexpected URL: ${url.href}`, { status: 500 });
    };
}

/** A fake skill as a flat map of repo-relative path -> content. */
export interface FakeSkill {
    files: Record<string, string>;
}

/** Immediate children of `dir` for a flat file map (GitHub's contents API). */
export function listEntries(
    files: Record<string, string>,
    dir: string
): Array<{ name: string; type: 'file' | 'dir' }> {
    const seen = new Map<string, 'file' | 'dir'>();
    for (const path of Object.keys(files)) {
        if (dir && !path.startsWith(`${dir}/`)) continue;
        const rest = dir ? path.slice(dir.length + 1) : path;
        const [head, ...tail] = rest.split('/');
        if (!head) continue;
        seen.set(head, tail.length > 0 ? 'dir' : 'file');
    }
    return [...seen.entries()].map(([name, type]) => ({ name, type }));
}

/**
 * Serves the GitHub endpoints a skill download uses from an in-memory skill.
 * `failRaw` can fail the raw download of a single file path.
 */
export function skillGithubMock(
    skillName: string,
    skill: FakeSkill,
    failRaw?: (path: string) => boolean
): (input: string | URL | Request) => Response {
    const prefix = `ecosystem/skills/${skillName}`;
    const rawBase = 'https://raw.githubusercontent.com/isfhan/burger-api/x';
    return (input: string | URL | Request): Response => {
        const url = new URL(String(input));
        const contents = url.pathname.match(/\/contents\/(.+)$/);
        if (contents) {
            const repoPath = decodeURIComponent(contents[1]!);
            if (repoPath !== prefix && !repoPath.startsWith(`${prefix}/`)) {
                return new Response('not found', { status: 404 });
            }
            const dir =
                repoPath === prefix ? '' : repoPath.slice(prefix.length + 1);
            return Response.json(
                listEntries(skill.files, dir).map((entry) => ({
                    name: entry.name,
                    path: `${repoPath}/${entry.name}`,
                    type: entry.type,
                    ...(entry.type === 'file' && {
                        download_url: `${rawBase}/${repoPath}/${entry.name}`,
                    }),
                    size: 1,
                }))
            );
        }

        const raw = url.pathname.match(
            new RegExp(`/ecosystem/skills/${skillName}/(.+)$`)
        );
        if (raw) {
            const filePath = raw[1]!;
            if (failRaw?.(filePath)) {
                return new Response('server error', { status: 500 });
            }
            const content = skill.files[filePath];
            if (content === undefined) {
                return new Response('not found', { status: 404 });
            }
            return new Response(content);
        }

        return new Response(`unexpected URL: ${url.href}`, { status: 500 });
    };
}

/** The skill the skills flow tests download. */
export const DEMO_SKILL: FakeSkill = {
    files: {
        'SKILL.md': '---\ndescription: Demo skill\n---\n\n# Demo',
        'references/routing.md': '# Routing',
        'references/nested/cli.md': '# CLI',
    },
};
