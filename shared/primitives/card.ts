/**
 * Card primitives — Card, MetricCard, CardGrid, MetricGrid.
 *
 * Cards use design tokens for consistent appearance across all report types.
 * Severity variants apply colored left-border accents.
 *
 * @module primitives/card
 */

import { tokens } from '../theme-tokens.js';

export interface CardProps {
    variant?: 'default' | 'elevated' | 'bordered';
    severity?: 'default' | 'success' | 'error' | 'warn' | 'info';
    icon?: string;
    title?: string;
    children: string;
    padding?: number;
    role?: string;
    ariaLabel?: string;
}

export function Card(props: CardProps): string {
    const s = props.severity || 'default';
    const shadow = props.variant === 'elevated' ? tokens.shadow.elevated : tokens.shadow.card;
    const border = props.variant === 'bordered' ? `border:1px solid var(--color-border-default)` : '';
    return `<div data-component="card" data-variant="${props.variant || 'default'}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="background:var(--color-surface-card);
               border-radius:${tokens.borderRadius.lg}px;
               padding:${props.padding ?? tokens.spacing.lg}px ${tokens.spacing.xl}px;
               box-shadow:${shadow};${border};
               ${s !== 'default' ? `border-left:4px solid var(--color-${s})` : ''};
               color:var(--color-text-primary)">
        ${props.icon ? `<span data-part="icon" style="margin-right:${tokens.spacing.xs}px">${props.icon}</span>` : ''}
        ${props.title ? `<div data-part="title" style="font-size:${tokens.fontSize.lg};font-weight:${tokens.fontWeight.semibold};margin-bottom:${tokens.spacing.sm}px;color:var(--color-text-primary)">${props.title}</div>` : ''}
        <div data-part="body">${props.children}</div>
    </div>`;
}

export interface MetricCardProps {
    label: string;
    value: string;
    severity?: 'default' | 'success' | 'error' | 'warn' | 'info';
    trend?: string;
    icon?: string;
    role?: string;
    ariaLabel?: string;
}

export function MetricCard(props: MetricCardProps): string {
    const s = props.severity || 'default';
    const valColor: Record<string, string> = {
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        warn: 'var(--color-warn)',
        info: 'var(--color-info)',
        default: 'var(--color-text-primary)',
    };
    return `<div data-component="metric-card" data-severity="${s}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="background:var(--color-surface-card);
               border-radius:${tokens.borderRadius.lg}px;
               padding:${tokens.spacing.lg}px ${tokens.spacing.xl}px;
               box-shadow:${tokens.shadow.card};
               min-width:100px;
               text-align:${props.icon ? 'left' : 'center'}">
        ${props.icon ? `<div data-part="icon" style="font-size:${tokens.fontSize.xl};margin-bottom:${tokens.spacing.xs}px">${props.icon}</div>` : ''}
        <div data-part="label" style="font-size:${tokens.fontSize.xs};text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:${tokens.spacing.xs}px">${props.label}</div>
        <div data-part="value" style="font-size:${tokens.fontSize['2xl']};font-weight:${tokens.fontWeight.bold};color:${valColor[s]}">${props.value}</div>
        ${props.trend ? `<div data-part="trend" style="font-size:${tokens.fontSize.xs};color:var(--color-text-muted);margin-top:${tokens.spacing.xs}px">${props.trend}</div>` : ''}
    </div>`;
}

export interface CardGridProps {
    children: string;
    minColumnWidth?: number;
    gap?: number;
    role?: string;
    ariaLabel?: string;
}

export function CardGrid(props: CardGridProps): string {
    const gap = props.gap ?? tokens.spacing.md;
    const minWidth = props.minColumnWidth ?? 280;
    return `<div data-component="card-grid"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${minWidth}px,1fr));gap:${gap}px">
        ${props.children}
    </div>`;
}

export interface MetricGridProps {
    children: string;
    gap?: number;
    role?: string;
    ariaLabel?: string;
}

export function MetricGrid(props: MetricGridProps): string {
    const gap = props.gap ?? tokens.spacing.md;
    return `<div data-component="metric-grid"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:flex;gap:${gap}px;flex-wrap:wrap;margin-bottom:${tokens.spacing.xl}px">
        ${props.children}
    </div>`;
}
