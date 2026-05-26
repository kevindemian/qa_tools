import { stripVTControlCharacters } from 'util';
import { palette, applyPalette, type PaletteKey } from './palette';
import { getTheme } from './theme';

export type BoxBorder = 'single' | 'double' | 'round' | 'none';

export interface BoxOptions {
    title?: string;
    border?: BoxBorder;
    color?: PaletteKey;
    padding?: number;
    width?: number;
}

export function visibleWidth(s: string): number {
    return stripVTControlCharacters(s).length;
}

const BORDERS: Record<string, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
    single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
    double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
};

const NONE = { tl: '', tr: '', bl: '', br: '', h: '', v: '' };

function boxContentWidth(lines: string[], title: string, padding: number, maxWidth?: number): number {
    const termWidth = process.stdout.columns || 80;
    if (maxWidth) return maxWidth;
    const longest = Math.max(...lines.map((l) => visibleWidth(l)), title ? visibleWidth(title) + 4 : 0, 20);
    const overhead = 8 + padding * 2;
    return Math.min(longest + overhead, termWidth - 2);
}

function buildTopBorder(
    title: string,
    hArea: number,
    b: { tl: string; tr: string; h: string },
    borderChalk: (s: string) => string,
    styled: (s: string) => string,
    leftPad: string,
): string {
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

function buildContentRows(
    lines: string[],
    innerWidth: number,
    hArea: number,
    padding: number,
    b: { v: string; bl: string; br: string; h: string },
    borderChalk: (s: string) => string,
    styled: (s: string) => string,
    leftPad: string,
    showBorder: boolean,
): string[] {
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
    const b = borderStyle === 'none' ? NONE : BORDERS[borderStyle]!;
    const styled = color ? applyPalette(color) : palette.fg;
    const borderChalk = color ? applyPalette(color) : palette.border;
    const innerWidth = totalWidth - 8 - padding * 2;
    const hArea = totalWidth - 4;
    const leftPad = '  ';
    const rows: string[] = [];

    if (borderStyle !== 'none') {
        rows.push(buildTopBorder(title, hArea, b, borderChalk, styled, leftPad));
    }
    rows.push(
        ...buildContentRows(lines, innerWidth, hArea, padding, b, borderChalk, styled, leftPad, borderStyle !== 'none'),
    );
    if (borderStyle !== 'none') {
        rows.push(leftPad + borderChalk(b.bl + b.h.repeat(hArea) + b.br));
    }

    return rows.join('\n');
}

export function divider(width?: number): string {
    const w = width || process.stdout.columns || 80;
    return palette['text-muted']('─'.repeat(Math.min(w - 2, 78)));
}

export function card(
    title: string,
    content: string[],
    options: { border?: BoxBorder; color?: PaletteKey; width?: number } = {},
): string {
    return box(content, {
        title,
        border: options.border || 'round',
        color: options.color || 'border',
        padding: 1,
        width: options.width,
    });
}
