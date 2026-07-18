/** ASCII/Unicode box-rendering utilities: bordered boxes, dividers, and card layouts.
 * Powered by the active theme (single, double, round, or none borders). */
import { stripVTControlCharacters } from 'util';
import { palette, applyPalette, type ChalkKey } from './palette.js';
import { getTheme } from './theme.js';

export type BoxBorder = 'single' | 'double' | 'round' | 'none';

export interface BoxOptions {
    title?: string;
    border?: BoxBorder;
    color?: ChalkKey;
    padding?: number;
    width?: number;
}

/** Measured width of a string, ignoring ANSI escape codes. */
export function visibleWidth(s: string): number {
    return stripVTControlCharacters(s).length;
}

const TERMINAL_FALLBACK_WIDTH = 80;
const BOX_MIN_WIDTH = 20;
const BOX_OVERHEAD = 8;
const BOX_PADDING_MULTIPLIER = 2;
const BOX_BORDER_WIDTH = 4;
const DIVIDER_MAX_WIDTH = 78;

const BORDERS: Record<string, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
    single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
    double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
};

const NONE = { tl: '', tr: '', bl: '', br: '', h: '', v: '' };

function boxContentWidth(lines: string[], title: string, padding: number, maxWidth?: number): number {
    const termWidth = process.stdout.columns || TERMINAL_FALLBACK_WIDTH;
    if (maxWidth) return maxWidth;
    const longest = Math.max(
        ...lines.map((l) => visibleWidth(l)),
        title ? visibleWidth(title) + BOX_BORDER_WIDTH : 0,
        BOX_MIN_WIDTH,
    );
    const overhead = BOX_OVERHEAD + padding * BOX_PADDING_MULTIPLIER;
    return Math.min(longest + overhead, termWidth - BOX_PADDING_MULTIPLIER);
}

interface TopBorderOptions {
    title: string;
    hArea: number;
    b: { tl: string; tr: string; h: string };
    borderChalk: (s: string) => string;
    styled: (s: string) => string;
    leftPad: string;
}

function buildTopBorder(opts: TopBorderOptions): string {
    const { title, hArea, b, borderChalk, styled, leftPad } = opts;
    let top = leftPad + borderChalk(b.tl);
    if (title) {
        const titleText = ' ' + styled(title) + ' ';
        const titleW = visibleWidth(titleText);
        const leftH = Math.floor((hArea - titleW) / 2);
        const rightH = hArea - leftH - titleW;
        top += borderChalk(b.h.repeat(leftH)) + titleText + borderChalk(b.h.repeat(rightH));
    } else {
        top += borderChalk(b.h.repeat(hArea));
    }
    top += borderChalk(b.tr);
    return top;
}

interface BuildContentRowsOptions {
    lines: string[];
    innerWidth: number;
    hArea: number;
    padding: number;
    border: { v: string; bl: string; br: string; h: string };
    borderChalk: (s: string) => string;
    styled: (s: string) => string;
    leftPad: string;
    showBorder: boolean;
}

function buildContentRows(opts: BuildContentRowsOptions): string[] {
    const { lines, innerWidth, hArea, padding, border: b, borderChalk, styled, leftPad, showBorder } = opts;
    const rows: string[] = [];
    const pad = ' '.repeat(padding);
    if (showBorder && padding > 0) {
        rows.push(leftPad + borderChalk(b.v) + ' '.repeat(hArea) + borderChalk(b.v));
    }
    for (const line of lines) {
        const w = visibleWidth(line);
        const padded = w >= innerWidth ? line : line + ' '.repeat(innerWidth - w);
        rows.push(leftPad + borderChalk(b.v) + '  ' + pad + styled(padded) + pad + '  ' + borderChalk(b.v));
    }
    if (showBorder && padding > 0) {
        rows.push(leftPad + borderChalk(b.v) + ' '.repeat(hArea) + borderChalk(b.v));
    }
    return rows;
}

/** Render a bordered box around one or more lines of text.
 * Supports title, padding, colour, and border style. */
export function box(lines: string[], options: BoxOptions = {}): string {
    const theme = getTheme();
    const {
        title = '',
        border: borderStyle = theme.borders.type,
        color,
        padding = theme.borders.padding,
        width: maxWidth,
    } = options;
    const totalWidth = boxContentWidth(lines, title, padding, maxWidth);
    const b = borderStyle === 'none' ? NONE : (Object.entries(BORDERS).find(([k]) => k === borderStyle)?.[1] ?? NONE);
    const styled = color ? applyPalette(color) : palette.fg;
    const borderChalk = color ? applyPalette(color) : palette.border;
    const innerWidth = totalWidth - BOX_OVERHEAD - padding * BOX_PADDING_MULTIPLIER;
    const hArea = totalWidth - BOX_BORDER_WIDTH;
    const leftPad = '  ';
    const rows: string[] = [];

    if (borderStyle !== 'none') {
        rows.push(buildTopBorder({ title, hArea, b, borderChalk, styled, leftPad }));
    }
    rows.push(
        ...buildContentRows({
            lines,
            innerWidth,
            hArea,
            padding,
            border: b,
            borderChalk,
            styled,
            leftPad,
            showBorder: borderStyle !== 'none',
        }),
    );
    if (borderStyle !== 'none') {
        rows.push(leftPad + borderChalk(b.bl + b.h.repeat(hArea) + b.br));
    }

    return rows.join('\n');
}

/** Render a horizontal divider line (muted). */
export function divider(width?: number): string {
    const w = width || process.stdout.columns || TERMINAL_FALLBACK_WIDTH;
    return palette['text-muted']('─'.repeat(Math.min(w - BOX_PADDING_MULTIPLIER, DIVIDER_MAX_WIDTH)));
}

/** Render a bordered card with a centred title. Convenience wrapper around {@link box}. */
export function card(
    title: string,
    content: string[],
    options: { border?: BoxBorder; color?: ChalkKey; width?: number } = {},
): string {
    return box(content, {
        title,
        border: options.border || 'round',
        color: options.color || 'border',
        padding: 1,
        ...(options.width !== undefined ? { width: options.width } : {}),
    });
}
