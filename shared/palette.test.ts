import * as paletteModule from './palette.js';
import chalk from 'chalk';

describe('palette', () => {
    it('has all expected palette keys', () => {
        const { palette } = paletteModule;
        const expected = [
            'fg',
            'muted',
            'border',
            'blue',
            'green',
            'yellow',
            'red',
            'purple',
            'orange',
            'info',
            'cyan',
            'bold',
            'dim',
            'gray',
            'white',
            'bgBlack',
            'hex',
        ] as const;
        for (const key of expected) {
            expect(palette).toHaveProperty(key);
        }
    });

    it('applyPalette returns a chalk function for each ChalkInstance key', () => {
        const { applyPalette } = paletteModule;
        const nonFactoryKeys: Array<paletteModule.ChalkKey> = [
            'fg',
            'muted',
            'border',
            'blue',
            'green',
            'yellow',
            'red',
            'purple',
            'orange',
            'info',
            'cyan',
            'bold',
            'dim',
            'gray',
            'white',
            'bgBlack',
        ];
        for (const key of nonFactoryKeys) {
            const fn = applyPalette(key);
            expect(typeof fn).toBe('function');
            expect(typeof fn('text')).toBe('string');
        }
    });

    it('hex factory returns a function', () => {
        const { palette } = paletteModule;
        expect(typeof palette.hex).toBe('function');
        const chalkFn = palette.hex('#ff6600');
        expect(typeof chalkFn).toBe('function');
        expect(chalkFn('text')).toContain('text');
    });

    it('uses chalk.hex when chalk.level >= 2', () => {
        const origLevel = chalk.level;
        chalk.level = 2;
        const p = paletteModule.palette;
        expect(p.fg('text')).toContain('text');
        chalk.level = origLevel;
    });

    it('palette colors render text', () => {
        const { applyPalette } = paletteModule;
        const nonFactoryKeys: Array<paletteModule.ChalkKey> = [
            'fg',
            'muted',
            'border',
            'blue',
            'green',
            'yellow',
            'red',
            'purple',
            'orange',
            'info',
            'cyan',
            'bold',
            'dim',
            'gray',
            'white',
            'bgBlack',
        ];
        for (const key of nonFactoryKeys) {
            const fn = applyPalette(key);
            const result = fn('hello');
            expect(typeof result).toBe('string');
            expect(result).toContain('hello');
        }
    });

    it('disables chalk when NO_COLOR env is set', async () => {
        process.env.NO_COLOR = '1';
        const chalkMod: { level: number } = await vi.importActual('chalk');
        expect(chalkMod.level).toBe(0);
        delete process.env.NO_COLOR;
    });

    it('getColorLevel returns current chalk level', () => {
        const level = paletteModule.getColorLevel();
        expect(typeof level).toBe('number');
    });
});
