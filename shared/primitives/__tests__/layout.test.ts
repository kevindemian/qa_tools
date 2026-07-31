/**
 * Tests for layout primitives — Container, Section, Grid, FlexRow, Separator.
 *
 * @module primitives/layout.test
 */

import { Container, Section, Grid, FlexRow, Separator } from '../layout.js';

describe('Layout primitives', () => {
    describe('Container', () => {
        it('renders with default props', () => {
            const html = Container({ children: 'content' });

            expect(html).toContain('data-component="container"');
            expect(html).toContain('content');
            expect(html).toContain('role="region"');
        });

        it('renders with card variant and no inline style', () => {
            const html = Container({ children: 'test', variant: 'card' });

            expect(html).toContain('data-variant="card"');
            expect(html).not.toContain('style="');
        });

        it('renders with custom ariaLabel', () => {
            const html = Container({ children: 'x', ariaLabel: 'main' });

            expect(html).toContain('aria-label="main"');
        });
    });

    describe('Section', () => {
        it('renders with children', () => {
            const html = Section({ children: 'section content' });

            expect(html).toContain('data-component="section"');
            expect(html).toContain('section content');
        });

        it('renders with title', () => {
            const html = Section({ children: '', title: 'My Title' });

            expect(html).toContain('My Title');
            expect(html).toContain('data-part="section-title"');
        });

        it('renders card variant by default with CSS box-shadow hook and no inline style', () => {
            const html = Section({ children: '' });

            expect(html).toContain('data-variant="card"');
            expect(html).not.toContain('style="');
        });
    });

    describe('Grid', () => {
        it('renders grid container with dynamic column template', () => {
            const html = Grid({ children: 'items' });

            expect(html).toContain('data-component="grid"');
            expect(html).toContain('grid-template-columns:repeat(auto-fill,minmax(280px,1fr))');
            expect(html).toContain('items');
        });

        it('respects column count', () => {
            const html = Grid({ children: '', columns: 3 });

            expect(html).toContain('repeat(3,1fr)');
        });

        it('respects minColumnWidth', () => {
            const html = Grid({ children: '', minColumnWidth: 200 });

            expect(html).toContain('minmax(200px,1fr)');
        });

        it('emits data-gap for token gap values', () => {
            const html = Grid({ children: '', gap: 12 });

            expect(html).toContain('data-gap="12"');
        });

        it('keeps default gap out of inline style', () => {
            const html = Grid({ children: '', gap: 16 });

            expect(html).not.toContain('gap:16px');
            expect(html).not.toContain('data-gap');
        });

        it('rejects non-finite gap', () => {
            expect(() => Grid({ children: '', gap: Number.NaN })).toThrow(/finite non-negative/);
        });

        it('rejects infinite gap', () => {
            expect(() => Grid({ children: '', gap: Number.POSITIVE_INFINITY })).toThrow(/finite non-negative/);
        });

        it('rejects negative gap', () => {
            expect(() => Grid({ children: '', gap: -4 })).toThrow(/finite non-negative/);
        });

        it('rejects gap outside the design-token scale', () => {
            expect(() => Grid({ children: '', gap: 10 })).toThrow(/design-token scale/);
        });
    });

    describe('FlexRow', () => {
        it('renders flex container with no inline style', () => {
            const html = FlexRow({ children: 'items' });

            expect(html).toContain('data-component="flex-row"');
            expect(html).not.toContain('style="');
            expect(html).toContain('items');
        });

        it('renders with custom align via data attribute', () => {
            const html = FlexRow({ children: '', align: 'flex-end' });

            expect(html).toContain('data-align="flex-end"');
        });

        it('renders default align without data attribute', () => {
            const html = FlexRow({ children: '', align: 'center' });

            expect(html).not.toContain('data-align');
        });

        it('renders wrap false via data attribute', () => {
            const html = FlexRow({ children: '', wrap: false });

            expect(html).toContain('data-wrap="false"');
        });

        it('renders token gap via data attribute', () => {
            const html = FlexRow({ children: '', gap: 12 });

            expect(html).toContain('data-gap="12"');
            expect(html).not.toContain('style="');
        });

        it('rejects non-finite gap', () => {
            expect(() => FlexRow({ children: '', gap: Number.NaN })).toThrow(/finite non-negative/);
        });

        it('rejects infinite gap', () => {
            expect(() => FlexRow({ children: '', gap: Number.POSITIVE_INFINITY })).toThrow(/finite non-negative/);
        });

        it('rejects negative gap', () => {
            expect(() => FlexRow({ children: '', gap: -4 })).toThrow(/finite non-negative/);
        });

        it('rejects gap outside the design-token scale', () => {
            expect(() => FlexRow({ children: '', gap: 10 })).toThrow(/design-token scale/);
        });
    });

    describe('Separator', () => {
        it('renders an hr element', () => {
            const html = Separator({});

            expect(html).toContain('<hr');
            expect(html).toContain('data-component="separator"');
            expect(html).toContain('role="separator"');
        });
    });
});
