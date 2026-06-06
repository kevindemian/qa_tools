/**
 * Badge primitives — Badge, StatusBadge, SeverityBadge.
 *
 * Consistent badge rendering across all report types using design tokens.
 *
 * @module primitives/badge
 */

import { tokens } from '../theme-tokens.js';

export interface BadgeProps {
    variant?: 'default' | 'pass' | 'fail' | 'skip' | 'info' | 'warn';
    children: string;
    title?: string;
    role?: string | undefined;
    ariaLabel?: string | undefined;
}

const _badgeStyles: Record<string, { bg: string; text: string }> = {
    pass: { bg: 'var(--color-badge-pass-bg)', text: 'var(--color-badge-pass-text)' },
    fail: { bg: 'var(--color-badge-fail-bg)', text: 'var(--color-badge-fail-text)' },
    skip: { bg: 'var(--color-badge-skip-bg)', text: 'var(--color-badge-skip-text)' },
    info: { bg: 'var(--color-info)', text: '#ffffff' },
    warn: { bg: 'var(--color-warn)', text: '#333333' },
    default: { bg: 'var(--color-border-subtle)', text: 'var(--color-text-secondary)' },
};

export function Badge(props: BadgeProps): string {
    const v = props.variant || 'default';
    const style = _badgeStyles[v] as { bg: string; text: string };
    return `<span data-component="badge" data-variant="${v}"
        role="${props.role || 'status'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        ${props.title ? `title="${props.title}"` : ''}
        style="display:inline-block;padding:2px 8px;border-radius:${tokens.borderRadius.pill}px;
               font-size:${tokens.fontSize.sm};font-weight:${tokens.fontWeight.semibold};
               background:${style.bg};color:${style.text};
               line-height:1.4;vertical-align:middle">
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
    const variant = _statusToVariant[st] || 'default';
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
