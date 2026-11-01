#!/usr/bin/env bun
/**
 * Build CLI executable for a target platform with version injected at compile time.
 * Usage: bun run scripts/build-executable.ts <win|linux|mac|mac-intel>
 * Run from packages/cli directory.
 */

import { readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const PLATFORMS = {
 win: {
 target: 'bun-windows-x64',
 outfile: 'dist/burger-api.exe',
 },
 linux: {
 target: 'bun-linux-x64',
 outfile: 'dist/burger-api-linux',
 },
 mac: {
 target: 'bun-darwin-arm64',
 outfile: 'dist/burger-api-mac',
 },
 'mac-intel': {
 target: 'bun-darwin-x64',
 outfile: 'dist/burger-api-mac-intel',
 },
} as const;

type Platform = keyof typeof PLATFORMS;

function main(): void {
 const platformArg = process.argv[2];
 if (!platformArg || !(platformArg in PLATFORMS)) {
 console.error(
 'Usage: bun run scripts/build-executable.ts <win|linux|mac|mac-intel>'
 );
 process.exit(1);
 }
 const platform = platformArg as Platform;
 const { target, outfile } = PLATFORMS[platform];

 const cwd = process.cwd();
 const pkgPath = join(cwd, 'package.json');
 let version: string;
 try {
 const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
 version?: string;
 };
 version = pkg.version ?? '0.0.0';
 } catch {
 console.error('Could not read version from package.json');
 process.exit(1);
 }

 const entryPath = resolve(cwd, 'src/index.ts');
 const outPath = resolve(cwd, outfile);
 mkdirSync(resolve(cwd, 'dist'), { recursive: true });

 Bun.build({
 entrypoints: [entryPath],
 minify: true,
 define: {
 CLI_VERSION: JSON.stringify(version),
 },
 compile: {
 target,
 outfile: outPath,
 },
 })
 .then((result) => {
 if (!result.success) {
 console.error('Build failed');
 if (result.logs.length) {
 for (const log of result.logs) {
 console.error(log);
 }
 }
 process.exit(1);
 }
 console.log(`Built ${outfile} (version ${version})`);
 })
 .catch((err) => {
 console.error(err instanceof Error ? err.message : err);
 process.exit(1);
 });
}

main();
