import chalk from 'chalk';

export const palette = {
    fg: chalk.hex('#e1e1e1'),
    muted: chalk.hex('#8b949e'),
    border: chalk.hex('#30363d'),
    blue: chalk.hex('#58a6ff'),
    green: chalk.hex('#3fb950'),
    yellow: chalk.hex('#d29922'),
    red: chalk.hex('#f85149'),
    purple: chalk.hex('#bc8cff'),
    orange: chalk.hex('#f0883e'),
} as const;

export type PaletteKey = keyof typeof palette;

export function applyPalette(key: PaletteKey): chalk.Chalk {
    return palette[key];
}
