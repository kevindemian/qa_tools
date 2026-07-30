/**
 * Badge primitives — Badge, StatusBadge, SeverityBadge.
 *
 * Consistent badge rendering using data-* attributes for CSS styling.
 *
 * @module primitives/badge
 */

export interface BadgeProps {
    variant?: 'default' | 'pass' | 'fail' | 'skip' | 'info' | 'warn';
    children: string;
    title?: string;
    role?: string | undefined;
    ariaLabel?: string | undefined;
}

const _variantStyles = new Map([
    ['pass', 'background:var(--color-badge-pass-bg);color:var(--color-badge-pass-fg)'],
    ['fail', 'background:var(--color-badge-fail-bg);color:var(--color-badge-fail-fg)'],
    ['skip', 'background:var(--color-badge-skip-bg);color:var(--color-badge-skip-fg)'],
    ['info', 'background:var(--color-info);color:white'],
    ['warn', 'background:var(--color-badge-warn-bg);color:var(--color-badge-warn-fg)'],
    ['default', ''],
]);

export function Badge(props: BadgeProps): string {
    const v = props.variant || 'default';
    const style = _variantStyles.get(v) || '';
    return `<span data-component="badge" data-variant="${v}"
        role="${props.role || 'status'}"
        ${style ? `style="${style}"` : ''}
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        ${props.title ? `title="${props.title}"` : ''}>
        ${props.children}
    </span>`;
}

export interface StatusBadgeProps {
    status: string;
    children?: string;
    role?: string;
    ariaLabel?: string;
}

const _statusToVariant: Record<string, 'pass' | 'fail' | 'skip' | 'warn'> = {
    passed: 'pass',
    failed: 'fail',
    skipped: 'skip',
    aborted: 'skip',
    done: 'pass',
    closed: 'pass',
    'in progress': 'warn',
};

export function StatusBadge(props: StatusBadgeProps): string {
    const st = props.status.toLowerCase();
    const variant = Object.entries(_statusToVariant).find(([k]) => k === st)?.[1] || 'default';
    return Badge({
        variant,
        children: props.children || props.status,
        role: props.role,
        ariaLabel: props.ariaLabel,
    });
}

export interface SeverityBadgeProps {
    severity: string;
    children?: string;
    role?: string;
    ariaLabel?: string;
}

const _severityToVariant: Record<string, 'fail' | 'warn' | 'pass' | 'default'> = {
    high: 'fail',
    medium: 'warn',
    low: 'pass',
};

export function SeverityBadge(props: SeverityBadgeProps): string {
    const v = _severityToVariant[props.severity] || 'default';
    return Badge({
        variant: v,
        children: props.children || props.severity,
        role: props.role,
        ariaLabel: props.ariaLabel,
    });
}
