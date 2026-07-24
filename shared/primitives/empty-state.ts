/**
 * EmptyState primitive — displays a centered message when no data is available.
 *
 * Provides structured HTML with data-* attributes for CSS targeting.
 * No inline styles — all visual styling is handled by the CSS layer via data-* selectors.
 *
 * @module primitives/empty-state
 */

export interface EmptyStateProps {
    title: string;
    description: string;
    action?: string;
    icon?: string;
    role?: string;
    ariaLabel?: string;
}

export function EmptyState(props: EmptyStateProps): string {
    const icon = props.icon || '\u{1F50D}';
    return `<div data-component="empty-state"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : `aria-label="${props.title}"`}>
        <div data-part="icon">${icon}</div>
        <div data-part="title">${props.title}</div>
        <div data-part="description">${props.description}</div>
        ${props.action ? `<div data-part="action" data-action="guidance">${props.action}</div>` : ''}
    </div>`;
}
