/**
 * Card primitives — Card, MetricCard, CardGrid, MetricGrid.
 *
 * Cards use data-* attributes for CSS styling and theme identification.
 * Severity variants apply colored left-border accents via CSS.
 *
 * @module primitives/card
 */

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
    const variant = props.variant || 'default';
    return `<div data-component="card" data-variant="${variant}" data-severity="${s}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.icon ? `<span data-part="icon">${props.icon}</span>` : ''}
        ${props.title ? `<div data-part="title">${props.title}</div>` : ''}
        <div data-part="body">${props.children}</div>
    </div>`;
}

export interface MetricCardProps {
    label: string;
    value: string;
    severity?: 'default' | 'success' | 'error' | 'warn' | 'info';
    trend?: string | undefined;
    icon?: string | undefined;
    role?: string | undefined;
    ariaLabel?: string | undefined;
    /** Target/threshold value displayed below the main value (e.g., "target: 80%"). */
    target?: string | undefined;
    /** Sample-size warning message displayed when data is insufficient. */
    sampleWarning?: string | undefined;
}

export function MetricCard(props: MetricCardProps): string {
    const s = props.severity || 'default';
    const align = props.icon ? 'left' : 'center';
    const targetHtml = props.target != null ? `<div data-part="target">${props.target}</div>` : '';
    const sampleWarningHtml =
        props.sampleWarning != null ? `<div data-part="sample-warning">${props.sampleWarning}</div>` : '';
    return `<div data-component="metric-card" data-severity="${s}" data-align="${align}"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.icon ? `<div data-part="icon">${props.icon}</div>` : ''}
        <div data-part="label">${props.label}</div>
        <div data-part="value">${props.value}</div>
        ${targetHtml}
        ${props.trend ? `<div data-part="trend">${props.trend}</div>` : ''}
        ${sampleWarningHtml}
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
    return `<div data-component="card-grid"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
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
    return `<div data-component="metric-grid"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.children}
    </div>`;
}
