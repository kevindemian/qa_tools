/**
 * Tests for card primitives — Card, MetricCard, CardGrid, MetricGrid.
 *
 * @module primitives/card.test
 */

import { Card, MetricCard, CardGrid, MetricGrid } from '../card.js';

describe('Card primitives', () => {
    describe('Card', () => {
        it('renders with children', () => {
            const html = Card({ children: 'hello' });

            expect(html).toContain('data-component="card"');
            expect(html).toContain('hello');
            expect(html).toContain('data-part="body"');
        });

        it('renders with title', () => {
            const html = Card({ children: '', title: 'My Card' });

            expect(html).toContain('My Card');
            expect(html).toContain('data-part="title"');
        });

        it('renders with severity accent', () => {
            const html = Card({ children: '', severity: 'error' });

            expect(html).toContain('border-left:4px solid var(--color-error)');
        });

        it('renders with icon', () => {
            const html = Card({ children: '', icon: '🔥' });

            expect(html).toContain('🔥');
            expect(html).toContain('data-part="icon"');
        });

        it('renders elevated variant', () => {
            const html = Card({ children: '', variant: 'elevated' });

            expect(html).toContain('data-variant="elevated"');
        });

        it('renders bordered variant', () => {
            const html = Card({ children: '', variant: 'bordered' });

            expect(html).toContain('border:1px solid var(--color-border-default)');
        });
    });

    describe('MetricCard', () => {
        it('renders label and value', () => {
            const html = MetricCard({ label: 'Passed', value: '42' });

            expect(html).toContain('data-component="metric-card"');
            expect(html).toContain('Passed');
            expect(html).toContain('42');
        });

        it('renders with severity color', () => {
            const html = MetricCard({ label: 'x', value: '5', severity: 'success' });

            expect(html).toContain('data-severity="success"');
            expect(html).toContain('var(--color-success)');
        });

        it('renders trend indicator', () => {
            const html = MetricCard({ label: 'x', value: '5', trend: '+10%' });

            expect(html).toContain('data-part="trend"');
            expect(html).toContain('+10%');
        });

        it('renders with icon', () => {
            const html = MetricCard({ label: 'x', value: '5', icon: '✅' });

            expect(html).toContain('data-part="icon"');
            expect(html).toContain('✅');
        });
    });

    describe('CardGrid', () => {
        it('renders grid container', () => {
            const html = CardGrid({ children: 'cards' });

            expect(html).toContain('data-component="card-grid"');
            expect(html).toContain('display:grid');
            expect(html).toContain('cards');
        });
    });

    describe('MetricGrid', () => {
        it('renders flex container', () => {
            const html = MetricGrid({ children: 'metrics' });

            expect(html).toContain('data-component="metric-grid"');
            expect(html).toContain('display:flex');
            expect(html).toContain('metrics');
        });
    });
});
