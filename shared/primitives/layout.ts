/**
 * Layout primitives — Container, Section, Grid, FlexRow, Separator.
 *
 * Each function is a pure data → HTML transformation using data-* attributes
 * for theme, identification, and CSS styling.
 *
 * @module primitives/layout
 */

export interface ContainerProps {
    children: string;
    variant?: 'page' | 'card';
    maxWidth?: number;
    padding?: number;
    role?: string;
    ariaLabel?: string;
}

export function Container(props: ContainerProps): string {
    const ds = props.variant || 'page';
    return `<div data-component="container" data-variant="${ds}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.children}
    </div>`;
}

export interface SectionProps {
    children: string;
    title?: string;
    variant?: 'default' | 'card';
    padding?: number;
    marginBottom?: number;
    role?: string;
    ariaLabel?: string;
    dataSection?: string;
}

export function Section(props: SectionProps): string {
    const ds = props.dataSection ? ` data-section="${props.dataSection}"` : '';
    const variant = props.variant || 'card';
    return `<div data-component="section" data-variant="${variant}"${ds}
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.title ? `<div data-part="section-title">${props.title}</div>` : ''}
        ${props.children}
    </div>`;
}

export interface GridProps {
    children: string;
    columns?: number;
    gap?: number;
    minColumnWidth?: number;
    role?: string;
    ariaLabel?: string;
}

const DEFAULT_GAP = 16;
const TOKEN_GAPS = new Set<number>([4, 8, 12, 16, 20, 24, 32]);

function gapAttr(gap: number | undefined): string {
    const g = gap ?? DEFAULT_GAP;
    if (!Number.isFinite(g) || g < 0) {
        throw new Error(`layout: gap must be a finite non-negative number (got ${gap})`);
    }
    if (g === DEFAULT_GAP) return '';
    if (!TOKEN_GAPS.has(g)) {
        throw new Error(`layout: gap ${g} is not in the design-token scale (4, 8, 12, 16, 20, 24, 32)`);
    }
    return ` data-gap="${g}"`;
}

export function Grid(props: GridProps): string {
    const cols = props.columns ?? 0;
    const minWidth = props.minColumnWidth ?? 0;
    let template: string;
    if (minWidth > 0) {
        template = `repeat(auto-fill,minmax(${minWidth}px,1fr))`;
    } else if (cols > 0) {
        template = `repeat(${cols},1fr)`;
    } else {
        template = `repeat(auto-fill,minmax(280px,1fr))`;
    }
    const gap = gapAttr(props.gap);
    return `<div data-component="grid"${gap}
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="grid-template-columns:${template}">
        ${props.children}
    </div>`;
}

export interface FlexRowProps {
    children: string;
    gap?: number;
    align?: 'center' | 'flex-start' | 'flex-end' | 'stretch';
    wrap?: boolean;
    role?: string;
    ariaLabel?: string;
}

export function FlexRow(props: FlexRowProps): string {
    const align = props.align ?? 'center';
    const gap = gapAttr(props.gap);
    const alignAttr = align !== 'center' ? ` data-align="${align}"` : '';
    const wrapAttr = props.wrap === false ? ' data-wrap="false"' : '';
    return `<div data-component="flex-row"${gap}${alignAttr}${wrapAttr}
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.children}
    </div>`;
}

export interface SeparatorProps {
    margin?: number;
    color?: string;
    role?: string;
}

export function Separator(props: SeparatorProps): string {
    return `<hr data-component="separator"
        role="${props.role || 'separator'}"
        aria-orientation="horizontal">`;
}
