/**
 * Table primitives — DataTable, THead, TBody, Td, Tr.
 *
 * Structured table rendering with sticky headers, sortable columns,
 * and consistent styling via design tokens.
 *
 * @module primitives/table
 */

import { tokens } from '../ui/theme-tokens.js';

export type TableAlign = 'left' | 'center' | 'right';

export interface TableColumn {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
    align?: TableAlign;
}

export interface TableRow {
    key: string;
    cells: Record<string, string>;
    class?: string;
    attrs?: string;
}

export interface DataTableProps {
    columns: TableColumn[];
    rows: TableRow[];
    stickyHeader?: boolean;
    sortable?: boolean;
    compact?: boolean;
    role?: string;
    ariaLabel?: string;
    caption?: string;
}

function renderTableHeader(columns: TableColumn[], cellPadding: string, headStyle: string): string {
    let html = `<thead style="background:var(--color-surface-elevated);${headStyle}"><tr>`;
    for (const col of columns) {
        const align = col.align ? `text-align:${col.align}` : 'text-align:left';
        const width = col.width ? `width:${col.width}` : '';
        const sortAttr = col.sortable ? ' data-sortable="true"' : '';
        html += `<th data-column="${col.key}"${sortAttr}
            scope="col"
            style="padding:${cellPadding};${align};${width};
                   font-size:${tokens.fontSize.sm};text-transform:uppercase;
                   color:var(--color-text-secondary);white-space:nowrap;
                   border-bottom:2px solid var(--color-border-subtle)">
            ${col.label}
            ${col.sortable ? '<span data-part="sort-indicator" style="margin-left:4px;opacity:0.4">↕</span>' : ''}
        </th>`;
    }
    html += '</tr></thead>';
    return html;
}

function renderTableRows(rows: TableRow[], columns: TableColumn[], cellPadding: string): string {
    let html = '<tbody>';
    for (const row of rows) {
        const cls = row.class ? ` class="${row.class}"` : '';
        html += `<tr data-row="${row.key}"${cls}${row.attrs || ''}
            style="border-bottom:1px solid var(--color-border-subtle);
                   transition:background 0.15s"
            onmouseover="this.style.background='var(--color-surface-elevated)'"
            onmouseout="this.style.background=''">`;
        for (const col of columns) {
            const cell = row.cells[col.key] ?? '';
            const align = col.align ? `text-align:${col.align}` : '';
            html += `<td style="padding:${cellPadding};${align};font-size:${tokens.fontSize.md};color:var(--color-text-primary)">${cell}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';
    return html;
}

export function DataTable(props: DataTableProps): string {
    const headStyle = props.stickyHeader ? 'position:sticky;top:0;z-index:1;' : '';
    const cellPadding = props.compact
        ? `${tokens.spacing.xs}px ${tokens.spacing.sm}px`
        : `${tokens.spacing.sm}px ${tokens.spacing.md}px`;

    let html = `<div data-component="table-wrapper" style="overflow-x:auto;border-radius:${tokens.borderRadius.lg}px;box-shadow:${tokens.shadow.card}">`;
    html += `<table data-component="data-table"
        role="${props.role || 'table'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="width:100%;border-collapse:collapse;background:var(--color-surface-card);
               font-size:${tokens.fontSize.lg};color:var(--color-text-primary)">`;
    if (props.caption) {
        html += `<caption style="caption-side:bottom;font-size:${tokens.fontSize.xs};color:var(--color-text-muted);padding:${tokens.spacing.sm}px;text-align:left">${props.caption}</caption>`;
    }
    html += renderTableHeader(props.columns, cellPadding, headStyle);
    html += renderTableRows(props.rows, props.columns, cellPadding);
    html += '</table></div>';
    return html;
}

export interface THeadProps {
    children: string;
}

export function THead(props: THeadProps): string {
    return `<thead style="background:var(--color-surface-elevated)">${props.children}</thead>`;
}

export interface TBodyProps {
    children: string;
}

export function TBody(props: TBodyProps): string {
    return `<tbody>${props.children}</tbody>`;
}

export interface TrProps {
    children: string;
    class?: string;
    key?: string;
    role?: string;
    ariaExpanded?: boolean;
    onClick?: string;
    attrs?: string;
}

export function Tr(props: TrProps): string {
    const clickAttr = props.onClick ? ` onclick="${props.onClick}"` : '';
    return `<tr data-row="${props.key || ''}"
        role="${props.role || 'row'}"
        ${props.ariaExpanded !== undefined ? `aria-expanded="${props.ariaExpanded}"` : ''}
        ${clickAttr}
        class="${props.class || ''}"
        ${props.attrs || ''}
        style="border-bottom:1px solid var(--color-border-subtle);
               transition:background 0.15s;
               ${props.onClick ? 'cursor:pointer' : ''}"
        onmouseover="this.style.background='var(--color-surface-elevated)'"
        onmouseout="this.style.background=''">
        ${props.children}
    </tr>`;
}

export interface TdProps {
    children: string;
    colSpan?: number;
    align?: 'left' | 'center' | 'right';
    class?: string;
    role?: string;
    title?: string;
}

export function Td(props: TdProps): string {
    const colspan = props.colSpan ? ` colspan="${props.colSpan}"` : '';
    const align = props.align ? `text-align:${props.align}` : '';
    const title = props.title ? ` title="${props.title}"` : '';
    return `<td${colspan}${title}
        role="${props.role || 'cell'}"
        class="${props.class || ''}"
        style="padding:${tokens.spacing.sm}px ${tokens.spacing.md}px;${align};
               font-size:${tokens.fontSize.md};color:var(--color-text-primary)">
        ${props.children}
    </td>`;
}

export interface ThProps {
    children: string;
    scope?: 'col' | 'row';
    sortable?: boolean;
    align?: 'left' | 'center' | 'right';
}

export function Th(props: ThProps): string {
    const align = props.align ? `text-align:${props.align}` : 'text-align:left';
    const sortAttr = props.sortable ? ' data-sortable="true"' : '';
    return `<th scope="${props.scope || 'col'}"${sortAttr}
        style="padding:${tokens.spacing.sm}px ${tokens.spacing.md}px;${align};
               font-size:${tokens.fontSize.sm};text-transform:uppercase;
               color:var(--color-text-secondary);white-space:nowrap;
               border-bottom:2px solid var(--color-border-subtle)">
        ${props.children}
    </th>`;
}
