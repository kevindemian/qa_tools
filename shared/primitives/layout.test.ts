/**
 * Tests for layout primitives — Container, Section, Grid, FlexRow, Separator.
 *
 * @module primitives/layout.test
 */

import { Container, Section, Grid, FlexRow, Separator } from './layout.js';

describe('layout primitives', () => {
    describe('Container', () => {
        it('renders with default props', async () => {
            const html = Container({ children: 'content' });
            expect(html).toContain('data-component="container"');
            expect(html).toContain('content');
            expect(html).toContain('role="region"');
        });

        it('renders with card variant', async () => {
            const html = Container({ children: 'test', variant: 'card' });
            expect(html).toContain('data-variant="card"');
            expect(html).toContain('var(--color-surface-card)');
        });

        it('renders with custom ariaLabel', async () => {
            const html = Container({ children: 'x', ariaLabel: 'main' });
            expect(html).toContain('aria-label="main"');
        });
    });

    describe('Section', () => {
        it('renders with children', async () => {
            const html = Section({ children: 'section content' });
            expect(html).toContain('data-component="section"');
            expect(html).toContain('section content');
        });

        it('renders with title', async () => {
            const html = Section({ children: '', title: 'My Title' });
            expect(html).toContain('My Title');
            expect(html).toContain('data-part="section-title"');
        });

        it('renders card variant by default', async () => {
            const html = Section({ children: '' });
            expect(html).toContain('box-shadow');
        });
    });

    describe('Grid', () => {
        it('renders grid container', async () => {
            const html = Grid({ children: 'items' });
            expect(html).toContain('data-component="grid"');
            expect(html).toContain('display:grid');
            expect(html).toContain('items');
        });

        it('respects column count', async () => {
            const html = Grid({ children: '', columns: 3 });
            expect(html).toContain('repeat(3,1fr)');
        });

        it('respects minColumnWidth', async () => {
            const html = Grid({ children: '', minColumnWidth: 200 });
            expect(html).toContain('minmax(200px,1fr)');
        });
    });

    describe('FlexRow', () => {
        it('renders flex container', async () => {
            const html = FlexRow({ children: 'items' });
            expect(html).toContain('data-component="flex-row"');
            expect(html).toContain('display:flex');
            expect(html).toContain('items');
        });

        it('renders with custom align', async () => {
            const html = FlexRow({ children: '', align: 'flex-end' });
            expect(html).toContain('align-items:flex-end');
        });
    });

    describe('Separator', () => {
        it('renders an hr element', async () => {
            const html = Separator({});
            expect(html).toContain('<hr');
            expect(html).toContain('data-component="separator"');
            expect(html).toContain('role="separator"');
        });
    });
});
