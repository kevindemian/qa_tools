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

export function getTheme(): UITheme {
    return defaultTheme;
}
