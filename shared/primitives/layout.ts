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
    const style = ds === 'card' ? 'background:var(--color-surface-card)' : '';
    return `<div data-component="container" data-variant="${ds}"
        role="${props.role || 'region'}"
        ${style ? `style="${style}"` : ''}
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
    const style = variant === 'card' ? 'box-shadow:0 1px 3px rgba(0,0,0,0.1)' : '';
    return `<div data-component="section" data-variant="${variant}"${ds}
        role="${props.role || 'region'}"
        ${style ? `style="${style}"` : ''}
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

export function Grid(props: GridProps): string {
    const gap = props.gap ?? 16;
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
    return `<div data-component="grid"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:grid;grid-template-columns:${template};gap:${gap}px">
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
    const gap = props.gap ?? 16;
    const align = props.align ?? 'center';
    return `<div data-component="flex-row"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:flex;gap:${gap}px;align-items:${align};${props.wrap !== false ? 'flex-wrap:wrap' : ''}">
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
