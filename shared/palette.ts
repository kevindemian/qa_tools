import chalk from 'chalk';

const level = chalk.level;

function hexOrBasic(hex: string, basic: chalk.Chalk): chalk.Chalk {
    return level >= 2 ? chalk.hex(hex) : basic;
}

export const palette = {
    fg: hexOrBasic('#e1e1e1', chalk.white),
    muted: hexOrBasic('#8b949e', chalk.gray),
    border: hexOrBasic('#30363d', chalk.dim),
    blue: hexOrBasic('#58a6ff', chalk.blue),
    green: hexOrBasic('#3fb950', chalk.green),
    yellow: hexOrBasic('#d29922', chalk.yellow),
    red: hexOrBasic('#f85149', chalk.red),
    purple: hexOrBasic('#bc8cff', chalk.magenta),
    orange: hexOrBasic('#f0883e', chalk.hex('#ff8800')),
} as const;

export type PaletteKey = keyof typeof palette;

export function applyPalette(key: PaletteKey): chalk.Chalk {
    return palette[key];
}
