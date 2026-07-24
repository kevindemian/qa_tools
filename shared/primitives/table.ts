/**
 * Table primitives — DataTable, THead, TBody, Td, Tr.
 *
 * Structured table rendering using data-* attributes for CSS styling.
 *
 * @module primitives/table
 */

import { sanitizeHtml } from '../escape.js';

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

function renderTableHeader(columns: TableColumn[]): string {
    let html = `<thead><tr>`;
    for (const col of columns) {
        const sortAttr = col.sortable ? ' data-sortable="true"' : '';
        const widthAttr = col.width ? ` style="width:${col.width}"` : '';
        const alignAttr = col.align ? ` style="text-align:${col.align}"` : '';
        html += `<th data-column="${sanitizeHtml(col.key)}"${sortAttr}${widthAttr || alignAttr}
            scope="col">
            ${col.label}
            ${col.sortable ? '<span data-part="sort-indicator">↕</span>' : ''}
        </th>`;
    }
    html += '</tr></thead>';
    return html;
}

function renderTableRows(rows: TableRow[], columns: TableColumn[]): string {
    let html = '<tbody>';
    for (const row of rows) {
        const cls = row.class ? ` class="${row.class}"` : '';
        html += `<tr data-row="${sanitizeHtml(row.key)}"${cls}${row.attrs || ''}>`;
        for (const col of columns) {
            const cell = row.cells[col.key] ?? '';
            const alignAttr = col.align ? ` style="text-align:${col.align}"` : '';
            html += `<td${alignAttr}>${cell}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';
    return html;
}

export function DataTable(props: DataTableProps): string {
    const ariaAttr = props.ariaLabel ? `aria-label="${props.ariaLabel}"` : '';
    let html = `<div data-component="table-wrapper">`;
    html += `<table data-component="data-table"
        role="${props.role || 'table'}"
        ${ariaAttr}>`;
    if (props.caption) {
        html += `<caption>${props.caption}</caption>`;
    }
    html += renderTableHeader(props.columns);
    html += renderTableRows(props.rows, props.columns);
    html += '</table></div>';
    return html;
}

export interface THeadProps {
    children: string;
}

export function THead(props: THeadProps): string {
    return `<thead>${props.children}</thead>`;
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
    const styleAttr = props.onClick ? ` style="cursor:pointer"` : '';
    return `<tr data-row="${sanitizeHtml(props.key || '')}"
        role="${props.role || 'row'}"
        ${props.ariaExpanded !== undefined ? `aria-expanded="${props.ariaExpanded}"` : ''}
        ${clickAttr}${styleAttr}
        class="${props.class || ''}"
        ${props.attrs || ''}>
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
    const title = props.title ? ` title="${props.title}"` : '';
    const alignAttr = props.align ? ` style="text-align:${props.align}"` : '';
    return `<td${colspan}${title}${alignAttr}
        role="${props.role || 'cell'}"
        class="${props.class || ''}">
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
    const sortAttr = props.sortable ? ' data-sortable="true"' : '';
    const alignAttr = props.align ? ` style="text-align:${props.align}"` : '';
    return `<th scope="${props.scope || 'col'}"${sortAttr}${alignAttr}>
        ${props.children}
    </th>`;
}
