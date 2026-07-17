import { describe, expect, it } from 'vitest';

describe('Deps — dependency wall', () => {
    it('exports expected dependencies', async () => {
        expect.hasAssertions();

        const deps = await import('../deps.js');

        expect(typeof deps.chalk).toBe('function');
        expect(typeof deps.axios).toBe('function');
        expect(deps.AdmZip).toBeDefined();
        expect(typeof deps.getGlob).toBe('function');
        expect(typeof deps.z).toBe('object');
    });

    it('getGlob returns globSync function', async () => {
        expect.hasAssertions();

        const deps = await import('../deps.js');
        const { globSync } = deps.getGlob();

        expect(typeof globSync).toBe('function');
    });

    it('exports globSync directly', async () => {
        expect.hasAssertions();

        const deps = await import('../deps.js');

        expect(typeof deps.globSync).toBe('function');
    });
});
