/** Visual theme contract for the terminal UI. Controls colors, borders, and typography.
 * Used by prompt-ui.ts to render consistent styled output. */

export interface UITheme {
    /** Named color hex values for UI elements. */
    colors: {
        success: string;
        error: string;
        warn: string;
        info: string;
        muted: string;
        border: string;
    };
    /** Border rendering preferences. */
    borders: {
        type: 'single' | 'double' | 'none';
        padding: number;
    };
    /** Text transform functions for semantic roles. */
    typography: {
        title: (s: string) => string;
        label: (s: string) => string;
        value: (s: string) => string;
    };
}

/** The default theme — dark-mode friendly, GitHub-inspired palette. */
export const defaultTheme: UITheme = {
    colors: {
        success: '#3fb950',
        error: '#f85149',
        warn: '#d29922',
        info: '#58a6ff',
        muted: '#8b949e',
        border: '#30363d',
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

/** Return the current UI theme. Currently returns the default; designed to support
 * dynamic theme switching (dark/light, custom) in the future. */
export function getTheme(): UITheme {
    return defaultTheme;
}
