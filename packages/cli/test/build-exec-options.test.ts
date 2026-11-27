/**
 * `build:exec` minifies by default, so the useful flag is `--no-minify`.
 * A `--minify` flag that defaults to true can never change anything.
 */
import { describe, expect, it } from 'bun:test';
import { buildExecutableCommand } from '../src/commands/build';

describe('build:exec options', () => {
    it('offers --no-minify instead of a no-op --minify', () => {
        const flags = buildExecutableCommand.options.map((o) => o.flags);
        expect(flags).toContain('--no-minify');
        expect(flags).not.toContain('--minify');
    });

    it('minifies unless --no-minify is passed', () => {
        const option = buildExecutableCommand.options.find(
            (o) => o.attributeName() === 'minify'
        );
        expect(option?.negate).toBe(true);
    });
});
