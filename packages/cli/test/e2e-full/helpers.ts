/**
 * Shared helpers for the full CLI end-to-end suite (`test:e2e:full`).
 *
 * Projects live in OS temp dirs and every CLI/server child runs with an
 * isolated `$BUN_INSTALL` link store, so the developer's global `bun link`
 * registrations are never touched. Servers are always killed (even on
 * failure) and every wait has a deadline.
 */
import { expect } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join, resolve } from 'path';
import { killTree, removeDir, treeKillSpawnOptions } from '../test-utils';

/** Absolute path to the CLI under test (packages/cli/src/index.ts). */
export const CLI_ENTRY = resolve(import.meta.dir, '..', '..', 'src', 'index.ts');

/** Repo root (contains packages/ and ecosystem/). */
export const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');

/** >= 32 bytes, the minimum the jwt-auth plugin accepts. */
export const JWT_SECRET = 'e2e-full-secret-e2e-full-secret-1234';

const tempDirs: string[] = [];

/** Unique temp dir under the OS temp dir, removed by {@link cleanupE2E}. */
export function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

/** Removes every temp dir this suite created (projects, sandboxes, copies). */
export function cleanupE2E(): void {
    for (const dir of tempDirs) removeDir(dir);
    tempDirs.length = 0;
}

/**
 * Local-mode projects resolve `burger-api` to the checkout's published entry
 * (`dist/`). Build it once when a fresh checkout has never been built.
 */
async function ensureFrameworkBuilt(): Promise<void> {
    const dist = join(
        REPO_ROOT,
        'packages',
        'burger-api',
        'dist',
        'src',
        'index.js'
    );
    if (existsSync(dist)) return;
    const result = await runCommand(['bun', 'run', 'build'], {
        cwd: join(REPO_ROOT, 'packages', 'burger-api'),
        timeoutMs: 600_000,
    });
    if (result.code !== 0) {
        throw new Error(`burger-api build failed:\n${result.err}`);
    }
}

/**
 * Isolated `$BUN_INSTALL` sandbox with burger-api, @burger-api/cli and
 * @burger-api/node-server registered via `bun link`.
 */
export async function createLinkSandbox(): Promise<string> {
    await ensureFrameworkBuilt();
    const store = tempDir('burger-e2e-full-store-');
    for (const pkg of ['burger-api', 'cli', 'node-server']) {
        const result = await runCommand(['bun', 'link'], {
            cwd: join(REPO_ROOT, 'packages', pkg),
            env: { BUN_INSTALL: store },
            timeoutMs: 120_000,
        });
        if (result.code !== 0) {
            throw new Error(
                `bun link failed in packages/${pkg}:\n${result.err}`
            );
        }
    }
    return store;
}

/** The Bun package cache, reused so sandboxed installs stay fast/offline. */
function bunCacheDir(): string | undefined {
    const dir = join(homedir(), '.bun', 'install', 'cache');
    return existsSync(dir) ? dir : undefined;
}

/** Env every project child process gets: sandbox links + local mode. */
export function e2eEnv(
    sandbox: string
): Record<string, string | undefined> {
    return {
        BUN_INSTALL: sandbox,
        BUN_INSTALL_CACHE_DIR: bunCacheDir(),
        BURGER_API_LOCAL: '1',
        JWT_SECRET,
    };
}

export interface CommandResult {
    code: number;
    out: string;
    err: string;
}

export interface CommandOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
}

/** Last `lines` lines of `text`, trimmed. */
function tail(text: string, lines: number): string {
    return text.split('\n').slice(-lines).join('\n').trim();
}

/**
 * Runs a command with piped output and a hard deadline. On timeout the whole
 * process tree is killed and the call throws with the stderr tail.
 */
export async function runCommand(
    args: string[],
    options: CommandOptions = {}
): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? 300_000;
    const proc = Bun.spawn(args, {
        cwd: options.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...options.env },
        ...treeKillSpawnOptions(),
    });
    const outPromise = new Response(proc.stdout).text();
    const errPromise = new Response(proc.stderr).text();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        void killTree(proc);
    }, timeoutMs);
    const code = await proc.exited;
    clearTimeout(timer);
    const [out, err] = await Promise.all([outPromise, errPromise]);
    if (timedOut) {
        throw new Error(
            `${args.join(' ')} timed out after ${timeoutMs}ms\n${tail(err, 8)}`
        );
    }
    return { code, out, err };
}

/** Runs the real CLI entry from `cwd` and captures stdout/stderr. */
export async function cli(
    cwd: string,
    args: string[],
    env?: Record<string, string | undefined>
): Promise<CommandResult> {
    return runCommand(['bun', CLI_ENTRY, ...args], {
        cwd,
        env,
        timeoutMs: 300_000,
    });
}

/** True when `args` can be spawned and exits (any code) within the deadline. */
export async function commandAvailable(
    args: string[],
    env?: Record<string, string | undefined>
): Promise<boolean> {
    try {
        const result = await runCommand(args, { env, timeoutMs: 60_000 });
        return result.code === 0;
    } catch {
        return false;
    }
}

/** Node major version, or undefined when node is missing. */
export async function nodeMajorVersion(): Promise<number | undefined> {
    if (!(await commandAvailable(['node', '--version']))) return undefined;
    const result = await runCommand(['node', '--version'], {
        timeoutMs: 30_000,
    });
    const match = /v(\d+)/.exec(result.out);
    return match ? Number(match[1]) : undefined;
}

/**
 * Scaffolds a project with the real `create` command in local mode. Always
 * passes `--no-skills` so the suite never depends on GitHub.
 */
export async function createFullProject(
    sandbox: string,
    name: string,
    flags: string[] = []
): Promise<string> {
    const parent = tempDir(`burger-e2e-full-${name}-`);
    const result = await cli(
        parent,
        ['create', name, '--yes', '--no-skills', '--local', ...flags],
        e2eEnv(sandbox)
    );
    if (result.code !== 0) {
        throw new Error(
            `create ${name} failed (exit ${result.code}):\n${result.out}\n${result.err}`
        );
    }
    return join(parent, name);
}

export interface InspectRoute {
    routePath: string;
    importPath: string;
    methods?: string[];
}

export interface InspectResult {
    version: number;
    config: {
        apiDir: string;
        pageDir: string;
        apiPrefix: string;
        pagePrefix: string;
        wsDir: string;
    };
    apiRoutes: InspectRoute[];
    pageRoutes: InspectRoute[];
    wsRoutes: InspectRoute[];
    hooks: { globalFile?: string; global: string[] };
    plugins: { pluginsFileFound: boolean; pluginsFile?: string };
}

export interface DoctorResult {
    version: number;
    ok: boolean;
    errorCount: number;
    checks: { name: string; pass: boolean; message: string }[];
}

/** `inspect --json`, parsed and asserted to exit 0. */
export async function inspectJson(
    cwd: string,
    env: Record<string, string | undefined>
): Promise<InspectResult> {
    const result = await cli(cwd, ['inspect', '--json'], env);
    expect(result.code).toBe(0);
    return JSON.parse(result.out) as InspectResult;
}

/** `doctor --json`, parsed (exit code is asserted by the caller). */
export async function doctorJson(
    cwd: string,
    env: Record<string, string | undefined>
): Promise<DoctorResult> {
    const result = await cli(cwd, ['doctor', '--json'], env);
    return JSON.parse(result.out) as DoctorResult;
}

export interface ServerSpec {
    command: string[];
    cwd: string;
    port: number;
    /** Path polled until it answers 2xx/3xx. */
    readyPath: string;
    timeoutMs?: number;
    env?: Record<string, string | undefined>;
}

/**
 * Boots a server, waits until `readyPath` answers successfully, runs `fn`,
 * then kills the whole process tree and drains its output — also on failure.
 */
export async function withServer<T>(
    spec: ServerSpec,
    fn: (base: string) => Promise<T>
): Promise<T> {
    const proc = Bun.spawn(spec.command, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        stdout: 'pipe',
        stderr: 'pipe',
        ...treeKillSpawnOptions(),
    });
    const stdoutPromise = new Response(proc.stdout).text();
    let stderrTail = '';
    const stderrPromise = (async () => {
        const reader = proc.stderr.getReader();
        const decoder = new TextDecoder();
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                stderrTail = tail(
                    stderrTail + decoder.decode(value),
                    8
                );
            }
        } catch {
            // stream closed by the kill below
        }
    })();

    const base = `http://127.0.0.1:${spec.port}`;
    try {
        await waitForReady(
            `${base}${spec.readyPath}`,
            spec.timeoutMs ?? 30_000,
            () => stderrTail,
            proc
        );
        return await fn(base);
    } finally {
        await killTree(proc);
        await Promise.allSettled([stdoutPromise, stderrPromise]);
    }
}

/** Polls `url` until it answers 2xx/3xx, failing fast on process exit. */
async function waitForReady(
    url: string,
    timeoutMs: number,
    getStderrTail: () => string,
    proc: { exited: Promise<number> }
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
        const exited = await Promise.race([
            proc.exited.then((code) => ({ code })),
            Bun.sleep(0).then(() => undefined),
        ]);
        if (exited) {
            throw new Error(
                `server exited with code ${exited.code} before it was ready at ${url}: ${getStderrTail() || 'no stderr'}`
            );
        }
        try {
            const res = await fetch(url);
            if (res.status >= 200 && res.status < 400) return;
            lastError = `HTTP ${res.status}`;
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
        await Bun.sleep(200);
    }
    throw new Error(
        `server did not start at ${url}: ${getStderrTail() || lastError}`
    );
}

/** Calls `fn` until it returns true or the deadline passes. */
export async function waitFor(
    fn: () => Promise<boolean> | boolean,
    timeoutMs: number,
    message: string
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await fn()) return;
        await Bun.sleep(100);
    }
    throw new Error(message);
}

/** Polls `url` until the JSON body satisfies `predicate`. */
export async function waitForJson(
    url: string,
    predicate: (body: unknown) => boolean,
    timeoutMs: number,
    message: string
): Promise<void> {
    await waitFor(
        async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) return false;
                return predicate(await res.json());
            } catch {
                return false;
            }
        },
        timeoutMs,
        message
    );
}

export interface SmokeAuth {
    loginPath: string;
    credentials: unknown;
    protectedPath: string;
    protectedBody: unknown;
    protectedStatus?: number;
}

export interface SmokeWs {
    path: string;
    query: string;
    /** Substring the broadcast must contain. */
    expectContains: string;
    /** Sends the request that triggers the broadcast. */
    trigger: () => Promise<void>;
}

export interface SmokeOptions {
    title: string;
    healthPath: string;
    unknownPath: string;
    pagePaths?: string[];
    validationPath?: string;
    auth?: SmokeAuth;
    corsPath?: string;
    ws?: SmokeWs;
}

function waitForWebSocketOpen(
    ws: WebSocket,
    timeoutMs: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('WebSocket did not open in time')),
            timeoutMs
        );
        ws.onopen = () => {
            clearTimeout(timer);
            resolve();
        };
        ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error('WebSocket connection error'));
        };
    });
}

/**
 * The shared smoke set: real HTTP requests against a running server.
 * Health 200, unknown 404, OpenAPI title, docs 200, optional pages, CORS,
 * WebSocket broadcast, then auth (401 → login → protected 201) and a
 * validation 422 with the token.
 */
export async function runSmoke(
    base: string,
    options: SmokeOptions
): Promise<void> {
    const health = await fetch(`${base}${options.healthPath}`);
    expect(health.status).toBe(200);

    const unknown = await fetch(`${base}${options.unknownPath}`);
    expect(unknown.status).toBe(404);

    const spec = (await (await fetch(`${base}/openapi.json`)).json()) as {
        info?: { title?: string };
    };
    expect(spec.info?.title).toBe(options.title);

    expect((await fetch(`${base}/docs`)).status).toBe(200);

    for (const path of options.pagePaths ?? []) {
        const page = await fetch(`${base}${path}`);
        expect(page.status).toBe(200);
        expect(page.headers.get('content-type') ?? '').toContain('text/html');
    }

    if (options.corsPath) {
        const cors = await fetch(`${base}${options.corsPath}`, {
            headers: { origin: 'https://example.com' },
        });
        expect(cors.status).toBe(200);
        expect(
            cors.headers.get('access-control-allow-origin')
        ).toBeTruthy();
        const preflight = await fetch(`${base}${options.corsPath}`, {
            method: 'OPTIONS',
            headers: {
                origin: 'https://example.com',
                'access-control-request-method': 'GET',
            },
        });
        expect(preflight.status).toBeGreaterThanOrEqual(200);
        expect(preflight.status).toBeLessThan(300);
    }

    if (options.ws) {
        const wsUrl = `ws://127.0.0.1:${new URL(base).port}${options.ws.path}?${options.ws.query}`;
        const ws = new WebSocket(wsUrl);
        const messages: string[] = [];
        ws.onmessage = (event) => messages.push(String(event.data));
        try {
            await waitForWebSocketOpen(ws, 10_000);
            await waitFor(
                () => messages.length > 0,
                5_000,
                `no WebSocket greeting from ${options.ws.path}`
            );
            await options.ws.trigger();
            await waitFor(
                () =>
                    messages.some((m) =>
                        m.includes(options.ws!.expectContains)
                    ),
                5_000,
                `no WebSocket broadcast containing ${options.ws.expectContains}`
            );
        } finally {
            ws.close();
        }
    }

    let token: string | null = null;
    if (options.auth) {
        const noToken = await fetch(`${base}${options.auth.protectedPath}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(options.auth.protectedBody),
        });
        expect(noToken.status).toBe(401);

        const login = await fetch(`${base}${options.auth.loginPath}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(options.auth.credentials),
        });
        expect(login.status).toBe(200);
        const body = (await login.json()) as { token?: string };
        expect(typeof body.token).toBe('string');
        token = body.token ?? null;

        const created = await fetch(`${base}${options.auth.protectedPath}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(options.auth.protectedBody),
        });
        expect(created.status).toBe(options.auth.protectedStatus ?? 201);
    }

    if (options.validationPath) {
        const invalid = await fetch(`${base}${options.validationPath}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(token
                    ? { authorization: `Bearer ${token}` }
                    : {}),
            },
            body: JSON.stringify({}),
        });
        expect(invalid.status).toBe(422);
    }
}

/** `bun run build` + assert the production bundle exists. */
export async function buildProject(
    cwd: string,
    env: Record<string, string | undefined>
): Promise<void> {
    const build = await runCommand(['bun', 'run', 'build'], {
        cwd,
        env,
        timeoutMs: 180_000,
    });
    expect(build.code).toBe(0);
    expect(existsSync(join(cwd, '.build', 'bundle', 'app.js'))).toBe(true);
}

/** Copy `.build/bundle/app.js` alone into a fresh temp dir and return it. */
export function copyBundleAlone(cwd: string): string {
    const dest = tempDir('burger-e2e-full-standalone-');
    copyFileSync(
        join(cwd, '.build', 'bundle', 'app.js'),
        join(dest, 'app.js')
    );
    return dest;
}

type CheckStatus = 'pass' | 'fail' | 'skip';

interface CheckRecord {
    name: string;
    status: CheckStatus;
    detail?: string;
}

const checks: CheckRecord[] = [];

/** Runs one named check, records pass/fail, and rethrows on failure. */
export async function step<T>(
    name: string,
    fn: () => Promise<T>
): Promise<T> {
    try {
        const result = await fn();
        checks.push({ name, status: 'pass' });
        return result;
    } catch (err) {
        checks.push({ name, status: 'fail' });
        throw err;
    }
}

/** Records a check that cannot run on this machine (missing tool). */
export function recordSkip(name: string, reason: string): void {
    checks.push({ name, status: 'skip', detail: reason });
}

let summaryPrinted = false;

/**
 * Prints the check table. Called by `zz-summary.test.ts` (Bun's test runner
 * does not emit the process `exit` event, so a dedicated last file owns it).
 */
export function printSummaryNow(): void {
    if (summaryPrinted || checks.length === 0) return;
    summaryPrinted = true;
    const width = Math.max(10, ...checks.map((c) => c.name.length));
    const lines: string[] = ['', 'E2E full summary', '─'.repeat(width + 18)];
    for (const check of checks) {
        const label = check.name.padEnd(width);
        const detail = check.detail ? ` (${check.detail})` : '';
        lines.push(`  ${label}  ${check.status.toUpperCase()}${detail}`);
    }
    const count = (status: CheckStatus) =>
        checks.filter((c) => c.status === status).length;
    lines.push('─'.repeat(width + 18));
    lines.push(
        `  ${String(count('pass')).padStart(3)} pass` +
            `  ${String(count('fail')).padStart(3)} fail` +
            `  ${String(count('skip')).padStart(3)} skip`
    );
    lines.push('');
    process.stdout.write(lines.join('\n'));
}

process.once('exit', printSummaryNow);
