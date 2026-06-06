/**
 * Form primitives — FilterBar, SearchInput, Button, ButtonGroup.
 *
 * Interactive controls for report filtering, export, and theme toggle.
 *
 * @module primitives/form
 */

import { tokens } from '../theme-tokens.js';

export interface FilterBarProps {
    children: string;
    role?: string;
    ariaLabel?: string;
}

export function FilterBar(props: FilterBarProps): string {
    return `<div data-component="filter-bar"
        role="${props.role || 'toolbar'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:flex;gap:${tokens.spacing.sm}px;align-items:center;margin-bottom:${tokens.spacing.md}px">
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
        oninput="${props.onInput || 'filterTable()'}"
        style="padding:${tokens.spacing.xs}px ${tokens.spacing.sm}px;
               border:1px solid var(--color-border-default);
               border-radius:${tokens.borderRadius.md}px;
               font-size:${tokens.fontSize.md};
               background:var(--color-surface-input);
               color:var(--color-text-primary);
               flex:1;min-width:150px;
               outline:none;transition:border-color 0.15s"
        onfocus="this.style.borderColor='var(--color-info)'"
        onblur="this.style.borderColor='var(--color-border-default)'">`;
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

export function Button(props: ButtonProps): string {
    const bg: Record<string, string> = {
        default: 'var(--color-surface-input)',
        primary: 'var(--color-info)',
        ghost: 'transparent',
    };
    const textColor: Record<string, string> = {
        default: 'var(--color-text-primary)',
        primary: '#ffffff',
        ghost: 'var(--color-text-primary)',
    };
    const v = props.variant || 'default';
    return `<button data-component="button" data-variant="${v}"
        type="button"
        ${props.id ? `id="${props.id}"` : ''}
        ${props.onClick ? `onclick="${props.onClick}"` : ''}
        ${props.title ? `title="${props.title}"` : ''}
        role="${props.role || 'button'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        ${props.disabled ? 'disabled' : ''}
        style="padding:${tokens.spacing.xs}px ${tokens.spacing.md}px;
               border:${v === 'ghost' ? 'none' : `1px solid var(--color-border-default)`};
               background:${bg[v]};
               color:${textColor[v]};
               border-radius:${tokens.borderRadius.md}px;
               cursor:${props.disabled ? 'default' : 'pointer'};
               font-size:${tokens.fontSize.md};
               font-family:${tokens.fontFamily};
               transition:all 0.15s;
               opacity:${props.disabled ? '0.5' : '1'}">
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
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:flex;gap:${tokens.spacing.xs}px">
        ${props.children}
    </div>`;
}

export interface LabelProps {
    children: string;
    htmlFor?: string;
    role?: string;
}

export function Label(props: LabelProps): string {
    return `<label data-component="label" ${props.htmlFor ? `for="${props.htmlFor}"` : ''}
        role="${props.role || 'text'}"
        style="font-size:${tokens.fontSize.xs};text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:${tokens.spacing.xs}px;display:block">
        ${props.children}
    </label>`;
}
