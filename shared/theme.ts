/**
 * Terminal UI theme contract — derived from design tokens.
 *
 * Controls colors, borders, and typography for the terminal UI.
 * Values are drawn from the shared design token system (theme-tokens.ts)
 * to ensure visual consistency between terminal output and HTML reports.
 *
 * @module theme
 */

import { tokens } from './theme-tokens';

export interface UITheme {
    colors: {
        success: string;
        error: string;
        warn: string;
        info: string;
        muted: string;
        border: string;
    };
    borders: {
        type: 'single' | 'double' | 'none';
        padding: number;
    };
    typography: {
        title: (s: string) => string;
        label: (s: string) => string;
        value: (s: string) => string;
    };
}

export const defaultTheme: UITheme = {
    colors: {
        success: tokens.color.semantic.success.dark,
        error: tokens.color.semantic.error.dark,
        warn: tokens.color.semantic.warn.dark,
        info: tokens.color.semantic.info.dark,
        muted: tokens.color.text.secondary.dark,
        border: tokens.color.border.default.dark,
    },
    borders: {
        type: 'single',
        padding: 1,
    },
    typography: {
        title: (s: string) => s.toUpperCase(),
        label: (s: string) => s,
        value: (s: string) => s,
    },
};

export function getTheme(): UITheme {
    return defaultTheme;
}
