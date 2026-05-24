import { stripVTControlCharacters } from 'util';
import { palette, applyPalette, type PaletteKey } from './palette';

export type BoxBorder = 'single' | 'double' | 'round' | 'none';

export interface BoxOptions {
    title?: string;
    border?: BoxBorder;
    color?: PaletteKey;
    padding?: number;
    width?: number;
}

function visibleWidth(s: string): number {
    return stripVTControlCharacters(s).length;
}

const BORDERS: Record<string, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
    single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
    double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
};

const NONE = { tl: '', tr: '', bl: '', br: '', h: '', v: '' };

export function box(lines: string[], options: BoxOptions = {}): string {
    const { title = '', border: borderStyle = 'single', color, padding = 0, width: maxWidth } = options;

    const termWidth = process.stdout.columns || 80;
    const contentWidth =
        maxWidth ||
        (() => {
            const longest = Math.max(...lines.map((l) => visibleWidth(l)), title ? visibleWidth(title) + 4 : 0, 20);
            const overhead = 8 + padding * 2;
            return Math.min(longest + overhead, termWidth - 2);
        })();
    const totalWidth = contentWidth;
    const b = borderStyle === 'none' ? NONE : BORDERS[borderStyle];
    const styled = color ? applyPalette(color) : palette.fg;
    const borderChalk = color ? applyPalette(color) : palette.border;

    const innerWidth = totalWidth - 8 - padding * 2;
    const hArea = totalWidth - 4;

    function padLine(line: string): string {
        const w = visibleWidth(line);
        if (w >= innerWidth) return line;
        return line + ' '.repeat(innerWidth - w);
    }

    const pad = ' '.repeat(padding);
    const leftPad = '  ';

    const rows: string[] = [];

    if (borderStyle !== 'none') {
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
        rows.push(top);
    }

    if (padding > 0) {
        rows.push(leftPad + borderChalk(b.v) + ' '.repeat(hArea) + borderChalk(b.v));
    }

    for (const line of lines) {
        rows.push(leftPad + borderChalk(b.v) + '  ' + pad + styled(padLine(line)) + pad + '  ' + borderChalk(b.v));
    }

    if (padding > 0) {
        rows.push(leftPad + borderChalk(b.v) + ' '.repeat(hArea) + borderChalk(b.v));
    }

    if (borderStyle !== 'none') {
        rows.push(leftPad + borderChalk(b.bl + b.h.repeat(hArea) + b.br));
    }

    return rows.join('\n');
}

export function divider(width?: number): string {
    const w = width || process.stdout.columns || 80;
    return palette.border('─'.repeat(Math.min(w - 2, 78)));
}
