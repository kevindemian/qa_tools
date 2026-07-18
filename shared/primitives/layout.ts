/**
 * Layout primitives — Container, Section, Grid, FlexRow, Separator.
 *
 * Each function is a pure data → HTML transformation using design tokens
 * for inline styles and data-* attributes for theme and identification.
 *
 * @module primitives/layout
 */

import { tokens } from '../ui/theme-tokens.js';

export interface ContainerProps {
    children: string;
    variant?: 'page' | 'card';
    maxWidth?: number;
    padding?: number;
    role?: string;
    ariaLabel?: string;
}

export function Container(props: ContainerProps): string {
    const padding = props.padding ?? tokens.spacing.xl;
    const maxWidth = props.maxWidth ?? 1200;
    const bg = props.variant === 'card' ? 'var(--color-surface-card)' : 'var(--color-surface-page)';
    return `<div data-component="container" data-variant="${props.variant || 'page'}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="background:${bg};padding:${padding}px;max-width:${maxWidth}px;margin:0 auto;
               font-family:${tokens.fontFamily};color:var(--color-text-primary);
               min-height:100vh">
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
}

export function Section(props: SectionProps): string {
    const padding = props.padding ?? tokens.spacing.lg;
    const mb = props.marginBottom ?? tokens.spacing.lg;
    const isCard = props.variant === 'card' || !props.variant;
    const styles = isCard
        ? `background:var(--color-surface-card);border-radius:${tokens.borderRadius.lg}px;padding:${padding}px;box-shadow:${tokens.shadow.card}`
        : '';
    return `<div data-component="section" data-variant="${props.variant || 'card'}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="${styles};margin-bottom:${mb}px">
        ${props.title ? `<div data-part="section-title" style="font-size:${tokens.fontSize.lg};font-weight:${tokens.fontWeight.semibold};margin-bottom:${tokens.spacing.sm}px;color:var(--color-text-primary)">${props.title}</div>` : ''}
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
    const gap = props.gap ?? tokens.spacing.md;
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
    const gap = props.gap ?? tokens.spacing.md;
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
    const margin = props.margin ?? tokens.spacing.lg;
    return `<hr data-component="separator"
        role="${props.role || 'separator'}"
        aria-orientation="horizontal"
        style="border:none;border-top:1px solid var(--color-border-subtle);margin:${margin}px 0">`;
}
