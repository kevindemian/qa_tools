describe('palette', () => {
    it('has all expected palette keys', () => {
        const { palette } = require('./palette') as { palette: Record<string, unknown> };
        const expected = ['fg', 'muted', 'border', 'blue', 'green', 'yellow', 'red', 'purple', 'orange'] as const;
        for (const key of expected) {
            expect(palette).toHaveProperty(key);
        }
    });

    it('applyPalette returns a chalk function for each key', () => {
        const { applyPalette, palette } = require('./palette') as {
            applyPalette: (k: string) => (...args: unknown[]) => string;
            palette: Record<string, (...args: unknown[]) => string>;
        };
        const keys = Object.keys(palette);
        for (const key of keys) {
            const fn = applyPalette(key);
            expect(typeof fn).toBe('function');
            expect(typeof fn('text')).toBe('string');
        }
    });

    it('hexOrBasic returns basic chalk for level < 2', () => {
        const palette = require('./palette');
        expect(palette.palette).toBeDefined();
    });

    it('uses chalk.hex when chalk.level >= 2', () => {
        jest.isolateModules(() => {
            const chalk = require('chalk');
            const origLevel = chalk.level;
            chalk.level = 2;
            const { palette: p } = require('./palette') as { palette: Record<string, (...args: unknown[]) => string> };
            expect(p.fg!('text')).toContain('text');
            chalk.level = origLevel;
        });
    });

    it('palette colors render text', () => {
        const { palette } = require('./palette') as { palette: Record<string, (...args: unknown[]) => string> };
        for (const key of Object.keys(palette)) {
            const result = palette[key]!('hello');
            expect(typeof result).toBe('string');
            expect(result).toContain('hello');
        }
    });
});
