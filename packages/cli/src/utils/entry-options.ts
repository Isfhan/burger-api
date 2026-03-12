import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';

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

function extractBurgerOptionsObjectLiteral(source: string): string | null {
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
    const tempFilePath = resolve(dirname(entryPath), ENTRY_OPTIONS_FILENAME);
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
