import { describe, it, expect } from 'bun:test';
import { reindent, isReindentable } from '../src/utils/reindent';

describe('reindent', () => {
    it('indents by bracket depth, one level per line', () => {
        const input = [
            'const app = new Burger({',
            ' apiDir: "./src/api",',
            ' nested: [',
            ' 1,',
            ' ],',
            '});',
        ].join('\n');
        expect(reindent(input)).toBe(
            [
                'const app = new Burger({',
                '    apiDir: "./src/api",',
                '    nested: [',
                '        1,',
                '    ],',
                '});',
            ].join('\n')
        );
    });

    it('ignores brackets inside strings and comments', () => {
        const input = ['function f() {', ' return "}"; // {', ' /* ( */', '}'].join('\n');
        expect(reindent(input)).toBe(
            ['function f() {', '    return "}"; // {', '    /* ( */', '}'].join('\n')
        );
    });

    it('aligns JSDoc continuation lines', () => {
        const input = ['export default {', ' /**', ' * docs', ' */', ' a: 1,', '};'].join('\n');
        expect(reindent(input)).toBe(
            ['export default {', '    /**', '     * docs', '     */', '    a: 1,', '};'].join('\n')
        );
    });

    it('leaves multi-line template literal content untouched', () => {
        const input = ['const s = `a', '  keep   me', '`;', 'x();'].join('\n');
        expect(reindent(input)).toBe(input);
    });

    it('only targets JS/TS source files', () => {
        expect(isReindentable('src/index.ts')).toBe(true);
        expect(isReindentable('src/index.mjs')).toBe(true);
        expect(isReindentable('package.json')).toBe(false);
        expect(isReindentable('src/pages/index.html')).toBe(false);
    });
});
