/**
 * Color palette — complete abstraction over chalk for dependency isolation.
 *
 * All modules MUST use palette instead of importing chalk directly.
 * This ensures:
 * - Swapping chalk is a 1-file change
 * - Consistent theming across the entire project
 * - Respects NO_COLOR env var automatically
 *
 * Usage:
 *   import { palette } from '../palette.js';
 *   output.print(palette.red('error') + palette.bold(' important'));
 *
 * @module palette
 */
import chalk, { type ChalkInstance } from 'chalk';
import Config from './config.js';

if (Config.get<boolean>('noColor')) {
    chalk.level = 0;
}

const level = chalk.level;

function hexOrBasic(hex: string, basic: ChalkInstance): ChalkInstance {
    return level >= 2 ? chalk.hex(hex) : basic;
}

function bgHexOrBasic(hex: string, basic: ChalkInstance): ChalkInstance {
    return level >= 2 ? chalk.bgHex(hex) : basic;
}

export const palette = {
    /** Foreground text — light gray or white fallback */
    fg: hexOrBasic('#e1e1e1', chalk.white),
    /** Muted secondary text — gray */
    muted: hexOrBasic('#8b949e', chalk.gray),
    /** Extra muted text — darker gray */
    'text-muted': hexOrBasic('#484f58', chalk.dim),
    /** UI borders — dark gray */
    border: hexOrBasic('#30363d', chalk.dim),

    /* Semantic colors */
    blue: hexOrBasic('#58a6ff', chalk.blue),
    'accent-dim': hexOrBasic('#1f6feb', chalk.blue),
    green: hexOrBasic('#3fb950', chalk.green),
    yellow: hexOrBasic('#d29922', chalk.yellow),
    red: hexOrBasic('#f85149', chalk.red),
    purple: hexOrBasic('#bc8cff', chalk.magenta),
    orange: hexOrBasic('#f0883e', chalk.hex('#ff8800')),
    info: hexOrBasic('#58a6ff', chalk.blue),
    cyan: chalk.cyan,

    /* Backgrounds */
    surface: bgHexOrBasic('#0d1117', chalk.bgBlack),
    'surface-alt': bgHexOrBasic('#161b22', chalk.bgBlack),

    /* Standalone styles */
    bold: chalk.bold,
    dim: chalk.dim,
    gray: chalk.gray,
    white: chalk.white,
    bgBlack: chalk.bgBlack,

    /** Hex color — creates a chalk instance with the given hex color.
     * Falls back to plain instance when color level < 2. */
    hex: (hex: string): ChalkInstance => (level >= 2 ? chalk.hex(hex) : chalk),
} as const;

type PaletteKey = keyof typeof palette;

/** Keys that are chalk instances (callable with `'text'`), excluding factory functions. */
export type ChalkKey = Exclude<PaletteKey, 'hex'>;

/** Apply a palette color to text. Returns the colored string. */
export function applyPalette(key: ChalkKey): ChalkInstance {
    const found = Object.entries(palette).find(([k]) => k === key);
    return found ? (found[1] as ChalkInstance) : palette.fg;
}

/** Chalk level — read-only accessor.
 * 0 = no color, 1 = basic, 2 = 256, 3 = 16m. */
export function getColorLevel(): number {
    return level;
}
