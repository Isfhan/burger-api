import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { SchemaRegistry, schemaRegistry } from '../../src/validation/registry';

describe('SchemaRegistry', () => {
    it('registers and resolves a named schema', () => {
        const reg = new SchemaRegistry();
        const schema = z.object({ id: z.string() });
        reg.register('Pagination', schema);
        expect(reg.has('Pagination')).toBe(true);
        expect(reg.resolve('Pagination')).toBe(schema);
    });

    it('throws on missing ref', () => {
        const reg = new SchemaRegistry();
        expect(() => reg.resolve('Missing')).toThrow(/Unknown model reference/);
    });

    it('clears on hot reload', () => {
        const reg = new SchemaRegistry();
        reg.register('A', z.object({}));
        expect(reg.size).toBe(1);
        reg.clear();
        expect(reg.size).toBe(0);
    });

    it('shared registry is importable', () => {
        expect(schemaRegistry).toBeInstanceOf(SchemaRegistry);
    });
});
