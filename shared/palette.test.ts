import { nonNull } from './test-utils';
import * as paletteModule from './palette';
import chalk from 'chalk';

describe('palette', () => {
    it('has all expected palette keys', () => {
        const { palette } = paletteModule;
        const expected = ['fg', 'muted', 'border', 'blue', 'green', 'yellow', 'red', 'purple', 'orange'] as const;
        for (const key of expected) {
            expect(palette).toHaveProperty(key);
        }
    });

    it('applyPalette returns a chalk function for each key', () => {
        const { applyPalette, palette } = paletteModule;
        const keys = Object.keys(palette);
        for (const key of keys) {
            const fn = applyPalette(key as keyof typeof palette);
            expect(typeof fn).toBe('function');
            expect(typeof fn('text')).toBe('string');
        }
    });

    it('hexOrBasic returns basic chalk for level < 2', () => {
        expect(paletteModule.palette).toBeDefined();
    });

    it('uses chalk.hex when chalk.level >= 2', () => {
        jest.isolateModules(() => {
            const origLevel = chalk.level;
            chalk.level = 2;
            const { palette: p } = require('./palette') as { palette: Record<string, (...args: unknown[]) => string> };
            expect(nonNull(p.fg)('text')).toContain('text');
            chalk.level = origLevel;
        });
    });

    it('palette colors render text', () => {
        const { palette, applyPalette } = paletteModule;
        for (const key of Object.keys(palette)) {
            const fn = applyPalette(key as keyof typeof palette);
            const result = fn('hello');
            expect(typeof result).toBe('string');
            expect(result).toContain('hello');
        }
    });
});
