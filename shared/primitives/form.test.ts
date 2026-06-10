/**
 * Tests for form primitives — FilterBar, SearchInput, Button, ButtonGroup, Label.
 *
 * @module primitives/form.test
 */

import { FilterBar, SearchInput, Button, ButtonGroup, Label } from './form.js';

describe('form primitives', () => {
    describe('FilterBar', () => {
        it('renders toolbar container', () => {
            const html = FilterBar({ children: 'controls' });
            expect(html).toContain('data-component="filter-bar"');
            expect(html).toContain('controls');
            expect(html).toContain('role="toolbar"');
        });
    });

    describe('SearchInput', () => {
        it('renders search input', () => {
            const html = SearchInput({});
            expect(html).toContain('data-component="search-input"');
            expect(html).toContain('type="text"');
            expect(html).toContain('role="searchbox"');
            expect(html).toContain('oninput="filterTable()"');
        });

        it('renders with custom placeholder', () => {
            const html = SearchInput({ placeholder: 'Search...' });
            expect(html).toContain('placeholder="Search..."');
        });

        it('renders with custom id', () => {
            const html = SearchInput({ id: 'mySearch' });
            expect(html).toContain('id="mySearch"');
        });

        it('renders with custom onInput', () => {
            const html = SearchInput({ onInput: 'myFilter()' });
            expect(html).toContain('oninput="myFilter()"');
        });
    });

    describe('Button', () => {
        it('renders default button', () => {
            const html = Button({ children: 'Click' });
            expect(html).toContain('data-component="button"');
            expect(html).toContain('Click');
            expect(html).toContain('type="button"');
            expect(html).toContain('role="button"');
        });

        it('renders primary variant', () => {
            const html = Button({ children: 'Save', variant: 'primary' });
            expect(html).toContain('data-variant="primary"');
            expect(html).toContain('var(--color-info)');
        });

        it('renders ghost variant', () => {
            const html = Button({ children: 'X', variant: 'ghost' });
            expect(html).toContain('data-variant="ghost"');
            expect(html).toContain('border:none');
        });

        it('renders with onClick', () => {
            const html = Button({ children: 'Go', onClick: 'submit()' });
            expect(html).toContain('onclick="submit()"');
        });

        it('renders disabled', () => {
            const html = Button({ children: 'X', disabled: true });
            expect(html).toContain('disabled');
            expect(html).toContain('opacity');
        });
    });

    describe('ButtonGroup', () => {
        it('renders group container', () => {
            const html = ButtonGroup({ children: 'buttons' });
            expect(html).toContain('data-component="button-group"');
            expect(html).toContain('buttons');
            expect(html).toContain('role="group"');
        });
    });

    describe('Label', () => {
        it('renders label element', () => {
            const html = Label({ children: 'Name' });
            expect(html).toContain('data-component="label"');
            expect(html).toContain('Name');
        });

        it('renders with htmlFor', () => {
            const html = Label({ children: 'Name', htmlFor: 'inputId' });
            expect(html).toContain('for="inputId"');
        });
    });
});
