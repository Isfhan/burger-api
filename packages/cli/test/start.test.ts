import { describe, expect, it } from 'bun:test';
import { mkdirSync, statSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import { newestMtime, resolveStartEntry } from '../src/commands/start';
import { makeTempDir, removeDir } from './test-utils';

/** Runs `run` with cwd set to a fresh temp dir (restored afterwards). */
function inTempDir(run: (dir: string) => void): void {
    const dir = makeTempDir('burger-start-');
    const originalCwd = process.cwd();
    try {
        process.chdir(dir);
        run(dir);
    } finally {
        process.chdir(originalCwd);
        removeDir(dir);
    }
}

describe('resolveStartEntry', () => {
    it('an explicit --file flag wins over everything', () => {
        inTempDir((dir) => {
            mkdirSync(join(dir, '.build', 'bundle'), { recursive: true });
            writeFileSync(join(dir, '.build', 'bundle', 'app.js'), '// bundle');
            expect(resolveStartEntry('custom/entry.ts')).toBe(
                'custom/entry.ts'
            );
        });
    });

    it('prefers the built bundle when present', () => {
        inTempDir((dir) => {
            mkdirSync(join(dir, '.build', 'bundle'), { recursive: true });
            writeFileSync(join(dir, '.build', 'bundle', 'app.js'), '// bundle');
            mkdirSync(join(dir, 'src'), { recursive: true });
            writeFileSync(join(dir, 'src', 'index.ts'), '');
            expect(resolveStartEntry(undefined)).toBe('.build/bundle/app.js');
        });
    });

    it('falls back to src/index.js when nothing else exists', () => {
        inTempDir((dir) => {
            mkdirSync(join(dir, 'src'), { recursive: true });
            writeFileSync(join(dir, 'src', 'index.js'), '');
            expect(resolveStartEntry(undefined)).toBe('src/index.js');
        });
    });

    it('names the conventional path when nothing exists', () => {
        inTempDir(() => {
            expect(resolveStartEntry(undefined)).toBe('src/index.ts');
        });
    });
});

describe('newestMtime', () => {
    it('returns 0 for a missing directory', () => {
        const dir = makeTempDir('burger-mtime-');
        try {
            expect(newestMtime(join(dir, 'missing'))).toBe(0);
        } finally {
            removeDir(dir);
        }
    });

    it('returns the newest mtime across nested directories', () => {
        const dir = makeTempDir('burger-mtime-');
        try {
            const oldFile = join(dir, 'old.txt');
            const nestedDir = join(dir, 'nested');
            mkdirSync(nestedDir);
            const newFile = join(nestedDir, 'new.txt');
            writeFileSync(oldFile, 'old');
            writeFileSync(newFile, 'new');
            utimesSync(oldFile, 1_000_000, 1_000_000);
            utimesSync(newFile, 2_000_000, 2_000_000);

            expect(newestMtime(dir)).toBe(statSync(newFile).mtimeMs);
            expect(newestMtime(dir)).toBeGreaterThan(
                statSync(oldFile).mtimeMs
            );
        } finally {
            removeDir(dir);
        }
    });
});
