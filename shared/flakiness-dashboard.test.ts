/**
 * Tests for flakiness-dashboard — HTML flakiness report using primitives.
 */

import { filterHighFlakiness, generateFlakinessHtml } from './flakiness-dashboard.js';
import type { FlakinessEntry } from './types/data-hub.js';

describe('FilterHighFlakiness', () => {
    it('filters entries above threshold', () => {
        const entries: FlakinessEntry[] = [
            {
                title: 'Very Flaky',
                project: 'test',
                passCount: 1,
                failCount: 9,
                skipCount: 0,
                totalRuns: 10,
                rate: 0.9,
            },
            { title: 'Stable', project: 'test', passCount: 9, failCount: 1, skipCount: 0, totalRuns: 10, rate: 0.1 },
            {
                title: 'Borderline',
                project: 'test',
                passCount: 6,
                failCount: 4,
                skipCount: 0,
                totalRuns: 10,
                rate: 0.4,
            },
        ];

        const result = filterHighFlakiness(entries, 30);

        expect(result).toHaveLength(2);
        expect(result[0]?.title).toBe('Very Flaky');
        expect(result[1]?.title).toBe('Borderline');
    });

    it('returns empty array when no entries exceed threshold', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Stable', project: 'test', passCount: 9, failCount: 1, skipCount: 0, totalRuns: 10, rate: 0.1 },
        ];

        expect(filterHighFlakiness(entries, 30)).toStrictEqual([]);
    });

    it('returns empty array for empty input', () => {
        expect(filterHighFlakiness([], 30)).toStrictEqual([]);
    });
});

describe('GenerateFlakinessHtml', () => {
    it('generates HTML with flaky test table', () => {
        const entries: FlakinessEntry[] = [
            {
                title: 'Login Flaky',
                project: 'test',
                passCount: 5,
                failCount: 5,
                skipCount: 0,
                totalRuns: 10,
                rate: 0.5,
            },
        ];

        const html = generateFlakinessHtml(entries);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Login Flaky');
        expect(html).toContain('50%');
        expect(html).toContain('Flakiness Dashboard');
    });

    it('shows entries below 50% rate with warn badge', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Mild', project: 'test', passCount: 7, failCount: 3, skipCount: 0, totalRuns: 10, rate: 0.3 },
        ];

        const html = generateFlakinessHtml(entries);

        expect(html).toContain('Mild');
        expect(html).toContain('30%');
        expect(html).toContain('data-component="badge"');
    });

    it('shows danger severity when more than 5 high-flakiness entries', () => {
        const entries: FlakinessEntry[] = Array.from({ length: 7 }, (_, i) => ({
            title: `Flaky#${i}`,
            project: 'test',
            passCount: 1,
            failCount: 9,
            skipCount: 0,
            totalRuns: 10,
            rate: 0.9,
        }));

        const html = generateFlakinessHtml(entries);

        expect(html).toContain('data-severity="error"');
        expect(html).toContain('7');
    });

    it('shows no-threshold message when all below threshold', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Stable', project: 'test', passCount: 9, failCount: 1, skipCount: 0, totalRuns: 10, rate: 0.1 },
        ];

        const html = generateFlakinessHtml(entries);

        expect(html).toContain('No tests exceed');
    });

    it('uses custom title', () => {
        const html = generateFlakinessHtml([], 'My Dashboard');

        expect(html).toContain('My Dashboard');
    });

    it('escapes HTML in test titles', () => {
        const entries: FlakinessEntry[] = [
            {
                title: '<script>alert(1)</script>',
                project: 'test',
                passCount: 5,
                failCount: 5,
                skipCount: 0,
                totalRuns: 10,
                rate: 0.5,
            },
        ];

        const html = generateFlakinessHtml(entries);

        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });

    it('includes dark mode theme toggle script', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Test', project: 'test', passCount: 5, failCount: 5, skipCount: 0, totalRuns: 10, rate: 0.5 },
        ];
        const html = generateFlakinessHtml(entries);

        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
    });

    it('includes dark mode CSS selectors', () => {
        const html = generateFlakinessHtml([]);

        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });
});
