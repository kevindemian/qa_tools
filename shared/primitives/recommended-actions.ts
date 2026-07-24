/**
 * RecommendedActions primitive — displays a list of actionable findings.
 *
 * Provides structured HTML with data-* attributes for CSS targeting.
 * No inline styles — all visual styling is handled by the CSS layer via data-* selectors.
 *
 * @module primitives/recommended-actions
 */

export interface RecommendedAction {
    severity: 'error' | 'warn' | 'info';
    text: string;
}

export interface RecommendedActionsProps {
    actions: RecommendedAction[];
    title?: string;
    role?: string;
    ariaLabel?: string;
}

export function RecommendedActions(props: RecommendedActionsProps): string {
    if (props.actions.length === 0) return '';

    const icons: Record<string, string> = {
        error: '\u26A0',
        warn: '\u26A0',
        info: '\u2139',
    };

    const items = props.actions
        .map(
            (a) =>
                `<li data-component="action-item" data-severity="${a.severity}">
            <span data-part="icon">${icons[a.severity] || ''}</span>
            <span data-part="text">${a.text}</span>
        </li>`,
        )
        .join('');

    return `<div data-component="recommended-actions"
        role="${props.role || 'region'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : 'aria-label="Recommended Actions"'}>
        <div data-part="title">${props.title || 'Recommended Actions'}</div>
        <ul data-part="list">${items}</ul>
    </div>`;
}
