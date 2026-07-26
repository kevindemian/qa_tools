/**
 * Form primitives — FilterBar, SearchInput, Button, ButtonGroup.
 *
 * Interactive controls for report filtering, export, and theme toggle.
 * Uses data-* attributes for CSS styling.
 *
 * @module primitives/form
 */

export interface FilterBarProps {
    children: string;
    role?: string;
    ariaLabel?: string;
}

export function FilterBar(props: FilterBarProps): string {
    return `<div data-component="filter-bar"
        role="${props.role || 'toolbar'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.children}
    </div>`;
}

export interface SearchInputProps {
    id?: string;
    placeholder?: string;
    onInput?: string;
    value?: string;
    role?: string;
    ariaLabel?: string;
}

export function SearchInput(props: SearchInputProps): string {
    const id = props.id || 'searchInput';
    return `<input data-component="search-input" type="text" id="${id}"
        placeholder="${props.placeholder || 'Filter...'}"
        value="${props.value || ''}"
        role="${props.role || 'searchbox'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        oninput="${props.onInput || 'filterTable()'}">`;
}

export interface ButtonProps {
    children: string;
    variant?: 'default' | 'primary' | 'ghost';
    onClick?: string;
    id?: string;
    title?: string;
    role?: string;
    ariaLabel?: string;
    disabled?: boolean;
}

const _buttonStyles = new Map([
    ['primary', 'background:var(--color-info);color:white'],
    ['ghost', 'border:none;background:transparent'],
    ['default', ''],
]);

export function Button(props: ButtonProps): string {
    const v = props.variant || 'default';
    const baseStyle = _buttonStyles.get(v) || '';
    const disabledStyle = props.disabled ? 'opacity:0.5;cursor:not-allowed' : '';
    const style = [baseStyle, disabledStyle].filter(Boolean).join(';');
    return `<button data-component="button" data-variant="${v}"
        type="button"
        ${props.id ? `id="${props.id}"` : ''}
        ${props.onClick ? `onclick="${props.onClick}"` : ''}
        ${props.title ? `title="${props.title}"` : ''}
        role="${props.role || 'button'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        ${style ? `style="${style}"` : ''}
        ${props.disabled ? 'disabled' : ''}>
        ${props.children}
    </button>`;
}

export interface ButtonGroupProps {
    children: string;
    role?: string;
    ariaLabel?: string;
}

export function ButtonGroup(props: ButtonGroupProps): string {
    return `<div data-component="button-group"
        role="${props.role || 'group'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        ${props.children}
    </div>`;
}

export interface LabelProps {
    children: string;
    htmlFor?: string;
    role?: string;
}

export function Label(props: LabelProps): string {
    const forAttr = props.htmlFor ? `for="${props.htmlFor}"` : '';
    return `<label data-component="label" ${forAttr}
        role="${props.role || 'text'}">
        ${props.children}
    </label>`;
}
