import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import { warning } from './logger';

interface PreparedEntryOptions {
    importPath?: string;
    tempFilePath?: string;
}

const ENTRY_OPTIONS_FILENAME = '__burger_build_options__.ts';

/**
 * Find the index of the closing ')' that matches the '(' at openIndex.
 * Skips strings, template literals, and comments so parens inside them are ignored.
 * Returns -1 if no matching ')' is found.
 */
function findMatchingClosingParen(source: string, openIndex: number): number {
    let depth = 1;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let interpolationBraceDepth = 0;
    let nestedTemplateDepth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openIndex + 1; i < source.length; i++) {
        const ch = source[i];
        const next = i + 1 < source.length ? source[i + 1] : '';

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inSingle) {
            if (!escaped && ch === "'") inSingle = false;
            escaped = !escaped && ch === '\\';
            continue;
        }
        if (inDouble) {
            if (!escaped && ch === '"') inDouble = false;
            escaped = !escaped && ch === '\\';
            continue;
        }
        if (inTemplate) {
            if (!escaped && ch === '`') {
                if (nestedTemplateDepth > 0) {
                    nestedTemplateDepth--;
                } else if (interpolationBraceDepth > 0) {
                    nestedTemplateDepth++;
                } else {
                    inTemplate = false;
                    interpolationBraceDepth = 0;
                    nestedTemplateDepth = 0;
                }
                escaped = false;
                continue;
            }
            if (!escaped && ch === '$' && next === '{') {
                interpolationBraceDepth = 1;
                i++;
                escaped = false;
                continue;
            }
            if (!escaped && nestedTemplateDepth === 0) {
                if (ch === '{') {
                    interpolationBraceDepth++;
                    escaped = false;
                    continue;
                }
                if (ch === '}') {
                    interpolationBraceDepth--;
                    escaped = false;
                    continue;
                }
            }
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            escaped = false;
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            escaped = false;
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            escaped = false;
            continue;
        }
        if (ch === '`') {
            inTemplate = true;
            interpolationBraceDepth = 0;
            nestedTemplateDepth = 0;
            escaped = false;
            continue;
        }

        if (ch === '(') {
            depth++;
            continue;
        }
        if (ch === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

export function extractBurgerOptionsObjectLiteral(
    source: string
): string | null {
    const burgerCtor = source.match(/\bnew\s+Burger\s*\(/);
    if (!burgerCtor || burgerCtor.index === undefined) {
        return null;
    }

    const callStart = source.indexOf('(', burgerCtor.index);
    if (callStart < 0) {
        return null;
    }

    const callEnd = findMatchingClosingParen(source, callStart);
    if (callEnd < 0) {
        return null;
    }

    const objectStart = source.indexOf('{', callStart + 1);
    if (objectStart < 0 || objectStart >= callEnd) {
        return null;
    }

    let i = objectStart;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let interpolationBraceDepth = 0;
    let nestedTemplateDepth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (; i < source.length; i++) {
        const ch = source[i];
        const next = i + 1 < source.length ? source[i + 1] : '';

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inSingle) {
            if (!escaped && ch === "'") inSingle = false;
            escaped = !escaped && ch === '\\';
            continue;
        }
        if (inDouble) {
            if (!escaped && ch === '"') inDouble = false;
            escaped = !escaped && ch === '\\';
            continue;
        }
        if (inTemplate) {
            if (!escaped && ch === '`') {
                if (nestedTemplateDepth > 0) {
                    nestedTemplateDepth--;
                } else if (interpolationBraceDepth > 0) {
                    nestedTemplateDepth++;
                } else {
                    inTemplate = false;
                    interpolationBraceDepth = 0;
                    nestedTemplateDepth = 0;
                }
                escaped = false;
                continue;
            }
            if (!escaped && ch === '$' && next === '{') {
                interpolationBraceDepth = 1;
                i++;
                escaped = false;
                continue;
            }
            if (!escaped && nestedTemplateDepth === 0) {
                if (ch === '{') {
                    interpolationBraceDepth++;
                    escaped = false;
                    continue;
                }
                if (ch === '}') {
                    interpolationBraceDepth--;
                    escaped = false;
                    continue;
                }
            }
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            escaped = false;
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            escaped = false;
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            escaped = false;
            continue;
        }
        if (ch === '`') {
            inTemplate = true;
            interpolationBraceDepth = 0;
            nestedTemplateDepth = 0;
            escaped = false;
            continue;
        }

        if (ch === '{') {
            depth++;
            continue;
        }
        if (ch === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(objectStart, i + 1);
            }
        }
    }

    return null;
}

/**
 * Production builds generate their own entry: only the code before
 * `new Burger(...)` (imports, constants) and the options object are kept.
 * Anything else after the constructor — `app.websocket(...)`, extra
 * `console.log`s, a custom port — never runs in the build. The usual
 * `const port = ...` + `app.serve(...)` tail is expected (the generated
 * entry serves on $PORT itself); everything else is reported so it is not
 * dropped silently. Returns the dropped lines (for tests).
 */
export function findDroppedEntryCode(source: string): string[] {
    const ctor = source.match(/\bnew\s+Burger\s*\(/);
    if (!ctor || ctor.index === undefined) return [];
    const open = source.indexOf('(', ctor.index);
    const close = findMatchingClosingParen(source, open);
    if (close < 0) return [];
    let rest = source.slice(close + 1);
    // Remove `<name>.serve( ... )` calls with their (multi-line) callbacks.
    for (;;) {
        const m = rest.match(/\b[A-Za-z_$][\w$]*\.serve\s*\(/);
        if (!m || m.index === undefined) break;
        const serveOpen = rest.indexOf('(', m.index);
        const serveClose = findMatchingClosingParen(rest, serveOpen);
        if (serveClose < 0) break;
        rest = rest.slice(0, m.index) + rest.slice(serveClose + 1);
    }
    return rest
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter(
            (line) =>
                line !== '' &&
                line !== ';' &&
                !/^(?:const|let|var)\s+port\s*=.*$/.test(line) &&
                !/^export\s+default\s+[A-Za-z_$][\w$]*;?$/.test(line)
        );
}

function warnAboutDroppedEntryCode(source: string, entryFile: string): void {
    const dropped = findDroppedEntryCode(source);
    if (dropped.length === 0) return;
    const shown = dropped.slice(0, 5).map((l) => `    ${l}`).join('\n');
    warning(
        `Code after \`new Burger(...)\` in ${entryFile} is not part of the production build ` +
            '(the build generates its own entry from your options, routes and convention files):\n' +
            shown +
            (dropped.length > 5 ? `\n    ... (${dropped.length - 5} more)` : '') +
            '\n  Move plugins/providers/hooks into src/plugins, src/providers, src/hooks, ' +
            'WebSocket handlers into file-based ws routes, and pass the port via $PORT.'
    );
}

export function prepareEntryOptionsModule(options: {
    cwd: string;
    entryFile: string;
}): PreparedEntryOptions {
    const entryPath = resolve(options.cwd, options.entryFile);
    if (!existsSync(entryPath)) {
        throw new Error(`Entry file not found: ${options.entryFile}`);
    }

    const source = readFileSync(entryPath, 'utf-8');
    const objectLiteral = extractBurgerOptionsObjectLiteral(source);

    if (!objectLiteral) {
        return {};
    }

    const burgerCtor = source.match(/\bnew\s+Burger\s*\(/);
    const rawPrelude = source.slice(0, burgerCtor?.index ?? 0).trimEnd();
    // Remove trailing partial assignment fragments like "const app ="
    // when the constructor is assigned (e.g. const app = new Burger(...)).
    const prelude = rawPrelude
        .replace(
            /(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*(?::\s*.*?)?\s*=\s*$/,
            ''
        )
        .replace(/\s*export\s+default\s*$/, '')
        .trimEnd();
    warnAboutDroppedEntryCode(source, options.entryFile);

    // JS projects get a `.js` options module (portable targets hand it to
    // wrangler/deno/vercel as-is, which must not see a .ts file there).
    const optionsFilename = /\.m?js$/.test(entryPath)
        ? ENTRY_OPTIONS_FILENAME.replace(/\.ts$/, '.js')
        : ENTRY_OPTIONS_FILENAME;
    const tempFilePath = resolve(dirname(entryPath), optionsFilename);
    const tempFileSource = [
        '// Auto-generated by burger-api build. Do not edit.',
        prelude,
        '',
        `export const burgerOptions = ${objectLiteral};`,
        '',
    ].join('\n');

    writeFileSync(tempFilePath, tempFileSource, 'utf-8');

    return {
        importPath: tempFilePath.split('\\').join('/'),
        tempFilePath,
    };
}

export function cleanupEntryOptionsModule(tempFilePath?: string): void {
    if (!tempFilePath) {
        return;
    }
    if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
    }
}
