import { describe, expect, it } from 'vitest';

describe('deps — dependency wall', () => {
    it('exports expected dependencies', async () => {
        const deps = await import('./deps.js');

        expect(typeof deps.chalk).toBe('function');
        expect(typeof deps.axios).toBe('function');
        expect(deps.AdmZip).toBeDefined();
        expect(typeof deps.getGlob).toBe('function');
        expect(typeof deps.z).toBe('object');
    });

    it('getGlob returns globSync function', async () => {
        const deps = await import('./deps.js');
        const { globSync } = deps.getGlob();

        expect(typeof globSync).toBe('function');
    });

    it('exports globSync directly', async () => {
        const deps = await import('./deps.js');

        expect(typeof deps.globSync).toBe('function');
    });
});
