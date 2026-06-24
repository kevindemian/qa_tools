/**
 * Tests for table primitives — DataTable, THead, TBody, Tr, Td, Th.
 *
 * @module primitives/table.test
 */

import { DataTable, THead, TBody, Tr, Td, Th } from './table.js';

describe('table primitives', () => {
    describe('DataTable', () => {
        const columns = [
            { key: 'name', label: 'Name' },
            { key: 'value', label: 'Value', align: 'right' as const },
        ];
        const rows = [
            { key: '1', cells: { name: 'Test 1', value: '42' } },
            { key: '2', cells: { name: 'Test 2', value: '99' }, class: 'highlight' },
        ];

        it('renders table with columns and rows', () => {
            const html = DataTable({ columns, rows });

            expect(html).toContain('data-component="data-table"');
            expect(html).toContain('Test 1');
            expect(html).toContain('42');
            expect(html).toContain('Test 2');
            expect(html).toContain('99');
        });

        it('renders column headers', () => {
            const html = DataTable({ columns, rows });

            expect(html).toContain('Name');
            expect(html).toContain('Value');
        });

        it('applies row class', () => {
            const html = DataTable({ columns, rows });

            expect(html).toContain('class="highlight"');
        });

        it('renders sortable columns', () => {
            const sortCols = [{ key: 'name', label: 'Name', sortable: true }];
            const html = DataTable({ columns: sortCols, rows: [] });

            expect(html).toContain('data-sortable="true"');
            expect(html).toContain('↕');
        });

        it('renders caption', () => {
            const html = DataTable({ columns, rows: [], caption: 'test table' });

            expect(html).toContain('test table');
            expect(html).toContain('<caption');
        });

        it('renders with ariaLabel', () => {
            const html = DataTable({ columns, rows, ariaLabel: 'test results' });

            expect(html).toContain('aria-label="test results"');
        });
    });

    describe('THead', () => {
        it('renders thead', () => {
            const html = THead({ children: '<tr><th>Name</th></tr>' });

            expect(html).toContain('<thead');
        });
    });

    describe('TBody', () => {
        it('renders tbody', () => {
            const html = TBody({ children: '<tr><td>data</td></tr>' });

            expect(html).toContain('<tbody>');
            expect(html).toContain('data');
        });
    });

    describe('Tr', () => {
        it('renders table row', () => {
            const html = Tr({ children: '<td>cell</td>' });

            expect(html).toContain('<tr');
            expect(html).toContain('cell');
            expect(html).toContain('role="row"');
        });

        it('renders with key', () => {
            const html = Tr({ children: '', key: 'row-1' });

            expect(html).toContain('data-row="row-1"');
        });

        it('renders with onClick', () => {
            const html = Tr({ children: '', onClick: 'alert()' });

            expect(html).toContain('onclick="alert()"');
            expect(html).toContain('cursor:pointer');
        });

        it('renders with ariaExpanded', () => {
            const html = Tr({ children: '', ariaExpanded: false });

            expect(html).toContain('aria-expanded="false"');
        });
    });

    describe('Td', () => {
        it('renders cell', () => {
            const html = Td({ children: 'cell data' });

            expect(html).toContain('<td');
            expect(html).toContain('cell data');
            expect(html).toContain('role="cell"');
        });

        it('renders with colSpan', () => {
            const html = Td({ children: '', colSpan: 3 });

            expect(html).toContain('colspan="3"');
        });
    });

    describe('Th', () => {
        it('renders header cell', () => {
            const html = Th({ children: 'Name' });

            expect(html).toContain('<th');
            expect(html).toContain('Name');
        });

        it('renders sortable', () => {
            const html = Th({ children: 'Name', sortable: true });

            expect(html).toContain('data-sortable="true"');
        });
    });
});
