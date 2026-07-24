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

const _severityAccent: Record<string, string> = {
    error: 'var(--color-error)',
    warn: 'var(--color-warn)',
    success: 'var(--color-success)',
    info: 'var(--color-info)',
    default: '',
};

const _severityColor: Record<string, string> = {
    error: 'var(--color-error)',
    warn: 'var(--color-warn)',
    success: 'var(--color-success)',
    info: 'var(--color-info)',
    default: '',
};

export function Card(props: CardProps): string {
    const s = props.severity || 'default';
    const variant = props.variant || 'default';
    const styles: string[] = [];
    if (variant === 'bordered') {
        styles.push('border:1px solid var(--color-border-default)');
    }
    if (s !== 'default' && _severityAccent[s]) {
        styles.push(`border-left:4px solid ${_severityAccent[s]}`);
    }
    const style = styles.length > 0 ? styles.join(';') : '';
    return `<div data-component="card" data-variant="${variant}" data-severity="${s}"
        role="${props.role || 'region'}"
        ${style ? `style="${style}"` : ''}
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
    trend?: string;
    icon?: string;
    role?: string;
    ariaLabel?: string;
}

export function MetricCard(props: MetricCardProps): string {
    const s = props.severity || 'default';
    const align = props.icon ? 'left' : 'center';
    const color = _severityColor[s] || '';
    return `<div data-component="metric-card" data-severity="${s}" data-align="${align}"
        role="${props.role || 'region'}"
        ${color ? `style="color:${color}"` : ''}
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.icon ? `<div data-part="icon">${props.icon}</div>` : ''}
        <div data-part="label">${props.label}</div>
        <div data-part="value">${props.value}</div>
        ${props.trend ? `<div data-part="trend">${props.trend}</div>` : ''}
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
        style="display:grid"
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
        style="display:flex"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.children}
    </div>`;
}
