/**
 * Tests for badge primitives — Badge, StatusBadge, SeverityBadge.
 *
 * @module primitives/badge.test
 */

import { Badge, StatusBadge, SeverityBadge } from './badge.js';

describe('badge primitives', () => {
    describe('Badge', () => {
        it('renders with text', async () => {
            const html = Badge({ children: 'PASS' });
            expect(html).toContain('data-component="badge"');
            expect(html).toContain('PASS');
            expect(html).toContain('role="status"');
        });

        it('renders pass variant', async () => {
            const html = Badge({ variant: 'pass', children: 'passed' });
            expect(html).toContain('data-variant="pass"');
            expect(html).toContain('var(--color-badge-pass-bg)');
        });

        it('renders fail variant', async () => {
            const html = Badge({ variant: 'fail', children: 'failed' });
            expect(html).toContain('data-variant="fail"');
            expect(html).toContain('var(--color-badge-fail-bg)');
        });

        it('renders skip variant', async () => {
            const html = Badge({ variant: 'skip', children: 'skipped' });
            expect(html).toContain('data-variant="skip"');
            expect(html).toContain('var(--color-badge-skip-bg)');
        });

        it('renders info variant', async () => {
            const html = Badge({ variant: 'info', children: 'info' });
            expect(html).toContain('data-variant="info"');
            expect(html).toContain('var(--color-info)');
        });

        it('renders with title', async () => {
            const html = Badge({ children: 'x', title: 'tooltip' });
            expect(html).toContain('title="tooltip"');
        });
    });

    describe('StatusBadge', () => {
        it('maps passed to pass variant', async () => {
            const html = StatusBadge({ status: 'passed' });
            expect(html).toContain('data-variant="pass"');
            expect(html).toContain('passed');
        });

        it('maps failed to fail variant', async () => {
            const html = StatusBadge({ status: 'failed' });
            expect(html).toContain('data-variant="fail"');
        });

        it('maps skipped to skip variant', async () => {
            const html = StatusBadge({ status: 'skipped' });
            expect(html).toContain('data-variant="skip"');
        });

        it('maps done to pass variant', async () => {
            const html = StatusBadge({ status: 'Done' });
            expect(html).toContain('data-variant="pass"');
        });

        it('maps closed to pass variant', async () => {
            const html = StatusBadge({ status: 'Closed' });
            expect(html).toContain('data-variant="pass"');
        });

        it('maps In Progress to warn variant', async () => {
            const html = StatusBadge({ status: 'In Progress' });
            expect(html).toContain('data-variant="warn"');
        });

        it('uses custom children', async () => {
            const html = StatusBadge({ status: 'passed', children: 'OK' });
            expect(html).toContain('OK');
        });
    });

    describe('SeverityBadge', () => {
        it('maps high to fail variant', async () => {
            const html = SeverityBadge({ severity: 'high' });
            expect(html).toContain('data-variant="fail"');
        });

        it('maps medium to warn variant', async () => {
            const html = SeverityBadge({ severity: 'medium' });
            expect(html).toContain('data-variant="warn"');
        });

        it('maps low to pass variant', async () => {
            const html = SeverityBadge({ severity: 'low' });
            expect(html).toContain('data-variant="pass"');
        });
    });
});
