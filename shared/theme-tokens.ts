/**
 * Design Token System — single source of truth for all visual decisions.
 *
 * Zero HTML, zero logic. Pure data only.
 * Every color, spacing, typography, shadow, and breakpoint value lives here.
 *
 * Tokens are organized into semantic groups:
 * - color.semantic: semantic role colors (success, error, warn, info)
 * - color.surface: surface/background colors (page, card, elevated, input)
 * - color.text: text colors (primary, secondary, muted)
 * - color.border: border colors (default, subtle)
 * - color.badge: badge background/text colors per status
 * - color.chart: chart colors (pass, fail, skip, line, ref)
 * - spacing: padding/margin scale (xs through xxxl)
 * - borderRadius: border radius scale (sm, md, lg, pill)
 * - fontSize: font size scale (xs through 2xl)
 * - fontWeight: font weight values
 * - fontFamily: system font stack
 * - shadow: box shadow values
 * - breakpoint: responsive breakpoints in px
 *
 * @module theme-tokens
 */

export interface ColorPair {
    light: string;
    dark: string;
}

export interface BadgeToken {
    bg: ColorPair;
    text: ColorPair;
}

export interface SemanticColors {
    success: ColorPair;
    error: ColorPair;
    warn: ColorPair;
    info: ColorPair;
}

export interface SurfaceColors {
    page: ColorPair;
    card: ColorPair;
    elevated: ColorPair;
    input: ColorPair;
}

export interface TextColors {
    primary: ColorPair;
    secondary: ColorPair;
    muted: ColorPair;
}

export interface BorderColors {
    default: ColorPair;
    subtle: ColorPair;
}

export interface BadgeColors {
    pass: BadgeToken;
    fail: BadgeToken;
    skip: BadgeToken;
}

export interface ChartColors {
    pass: string;
    fail: string;
    skip: string;
    line: string;
    ref: string;
}

export interface SpacingScale {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
}

export interface BorderRadiusScale {
    sm: number;
    md: number;
    lg: number;
    pill: number;
}

export interface FontSizeScale {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
}

export interface FontWeightScale {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
}

export interface BreakpointScale {
    sm: number;
    md: number;
    lg: number;
    xl: number;
}

export interface ShadowTokens {
    card: string;
    elevated: string;
}

export interface DesignTokens {
    color: {
        semantic: SemanticColors;
        surface: SurfaceColors;
        text: TextColors;
        border: BorderColors;
        badge: BadgeColors;
        chart: ChartColors;
    };
    spacing: SpacingScale;
    borderRadius: BorderRadiusScale;
    fontSize: FontSizeScale;
    fontWeight: FontWeightScale;
    fontFamily: string;
    shadow: ShadowTokens;
    breakpoint: BreakpointScale;
}

export const tokens: DesignTokens = {
    color: {
        semantic: {
            success: { light: '#22c55e', dark: '#4ade80' },
            error: { light: '#ef4444', dark: '#f87171' },
            warn: { light: '#facc15', dark: '#fbbf24' },
            info: { light: '#6366f1', dark: '#a5b4fc' },
        },
        surface: {
            page: { light: '#f9fafb', dark: '#0d1117' },
            card: { light: '#ffffff', dark: '#161b22' },
            elevated: { light: '#ffffff', dark: '#1c2128' },
            input: { light: '#ffffff', dark: '#21262d' },
        },
        text: {
            primary: { light: '#111827', dark: '#c9d1d9' },
            secondary: { light: '#4b5563', dark: '#8b949e' },
            muted: { light: '#6b7280', dark: '#6b7280' },
        },
        border: {
            default: { light: '#d1d5db', dark: '#30363d' },
            subtle: { light: '#e5e7eb', dark: '#21262d' },
        },
        badge: {
            pass: { bg: { light: '#dcfce7', dark: '#052e16' }, text: { light: '#166534', dark: '#4ade80' } },
            fail: { bg: { light: '#fecaca', dark: '#450a0a' }, text: { light: '#991b1b', dark: '#f87171' } },
            skip: { bg: { light: '#fef9c3', dark: '#451a03' }, text: { light: '#854d0e', dark: '#fbbf24' } },
        },
        chart: {
            pass: '#22c55e',
            fail: '#ef4444',
            skip: '#facc15',
            line: '#6366f1',
            ref: '#ef4444',
        },
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
    borderRadius: { sm: 4, md: 6, lg: 8, pill: 9999 },
    fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem', lg: '0.875rem', xl: '1rem', '2xl': '1.5rem' },
    fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    shadow: { card: '0 1px 3px rgba(0,0,0,0.1)', elevated: '0 4px 6px rgba(0,0,0,0.1)' },
    breakpoint: { sm: 640, md: 768, lg: 1024, xl: 1200 },
};

export function getToken(name: string): unknown {
    const parts = name.split('.');
    let current: unknown = tokens;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }
    return current;
}
