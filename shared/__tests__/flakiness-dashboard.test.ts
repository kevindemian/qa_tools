/**
 * Tests for flakiness-dashboard — HTML flakiness report using primitives.
 */

import { filterHighFlakiness, generateFlakinessHtml } from '../report/flakiness-dashboard.js';
import type { FlakinessEntry } from '../types/data-hub.js';
import type { QualityCategory, QualityReport } from '../data-hub/quality.js';
import type { DataSource } from '../types/data-hub.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

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

        const result = filterHighFlakiness(entries, { thresholdPct: 30 });

        expect(result).toHaveLength(2);
        expect(result[0]?.title).toBe('Very Flaky');
        expect(result[1]?.title).toBe('Borderline');
    });

    it('returns empty array when no entries exceed threshold', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Stable', project: 'test', passCount: 9, failCount: 1, skipCount: 0, totalRuns: 10, rate: 0.1 },
        ];

        expect(filterHighFlakiness(entries, { thresholdPct: 30 })).toStrictEqual([]);
    });

    it('returns empty array for empty input', () => {
        expect(filterHighFlakiness([], { thresholdPct: 30 })).toStrictEqual([]);
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

        const html = generateFlakinessHtml(entries, 'Flakiness Dashboard', { thresholds: { thresholdPct: 30 } });

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Login Flaky');
        expect(html).toContain('50%');
        expect(html).toContain('Flakiness Dashboard');
    });

    it('shows entries below 50% rate with warn badge', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Mild', project: 'test', passCount: 7, failCount: 3, skipCount: 0, totalRuns: 10, rate: 0.3 },
        ];

        const html = generateFlakinessHtml(entries, 'Flakiness Dashboard', { thresholds: { thresholdPct: 30 } });

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

        const html = generateFlakinessHtml(entries, 'Flakiness Dashboard', { thresholds: { thresholdPct: 30 } });

        expect(html).toContain('data-severity="error"');
        expect(html).toContain('7');
    });

    it('shows no-threshold message when all below threshold', () => {
        const entries: FlakinessEntry[] = [
            { title: 'Stable', project: 'test', passCount: 9, failCount: 1, skipCount: 0, totalRuns: 10, rate: 0.1 },
        ];

        const html = generateFlakinessHtml(entries, 'Flakiness Dashboard', { thresholds: { thresholdPct: 30 } });

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

    it('renders failure-records quality + provenance confidence when dataHub provided (C-3d)', () => {
        expect.hasAssertions();

        const provenance = new Map<string, DataSource>([
            ['failureRecords', { source: 'github', confidence: 0.7, timestamp: '2026-01-01T00:00:00.000Z' }],
        ]);
        const quality: Partial<Record<QualityCategory, QualityReport>> = {
            failureRecords: { valid: false, issues: ['missing classification for TC-1'] },
        };
        const hub = makeDataHubMock({ provenance, quality });

        const html = generateFlakinessHtml([], 'Flakiness', { dataHub: hub });

        expect(html).toContain('data-section="source-quality"');
        expect(html).toContain('failure-records source confidence: 70%');
        expect(html).toContain('failure-records quality issues: missing classification for TC-1');
    });

    it('includes the source quality banner even when no dataHub provided', () => {
        expect.hasAssertions();

        const html = generateFlakinessHtml([], 'Flakiness');

        expect(html).toContain('data-section="source-quality"');
        expect(html).toContain('Source Quality Banner');
    });

    it('shows explicit N/A (never silent 0%) for Flaky Rate when dataHub flakyTestRate is missing (B19)', () => {
        expect.hasAssertions();

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
        ];

        const html = generateFlakinessHtml(entries);

        const rateValue = /data-part="label">Flaky Rate<\/div>\s*<div data-part="value">([^<]+)<\/div>/.exec(html)?.[1];

        expect(rateValue).toBe('N/A');
        expect(html).toContain('Insufficient Data');
        expect(html).toContain('flakyTestRate');
    });

    it('renders real Flaky Rate when dataHub flakyTestRate is provided (B19 — SSOT source)', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock({
            computed: {
                testCounts: { passed: 98, failed: 2, skipped: 0, total: 100 },
                flakyTestRate: 1,
            },
        });
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
        ];

        const html = generateFlakinessHtml(entries, 'Flakiness', { dataHub: hub });

        const rateValue = /data-part="label">Flaky Rate<\/div>\s*<div data-part="value">([^<]+)<\/div>/.exec(html)?.[1];

        expect(rateValue).toBe('1%');
        expect(html).not.toContain('Insufficient Data');
    });

    it('uses flakyTestRate SSOT (not testCounts.total) for Flaky Rate (C-5 — cumulative denominator bug)', () => {
        expect.hasAssertions();

        // testCounts.total=100 (cumulative across all runs) but flakyTestRate=25 (actual rate)
        const hub = makeDataHubMock({
            computed: {
                testCounts: { passed: 98, failed: 2, skipped: 0, total: 100 },
                flakyTestRate: 25,
            },
        });
        const entries: FlakinessEntry[] = [
            {
                title: 'Flaky Test A',
                project: 'test',
                passCount: 75,
                failCount: 25,
                skipCount: 0,
                totalRuns: 100,
                rate: 0.25,
            },
        ];

        const html = generateFlakinessHtml(entries, 'Flakiness', { dataHub: hub });

        const rateValue = /data-part="label">Flaky Rate<\/div>\s*<div data-part="value">([^<]+)<\/div>/.exec(html)?.[1];

        // C-5 fix: renderer uses computed.flakyTestRate SSOT → 25%, not testCounts.total (1/100=1%). Regression test.
        expect(rateValue).toBe('25%');
    });

    it('shows N/A when flakyTestRate is undefined (C-5 — explicit no-data per §25)', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock({
            computed: { testCounts: { passed: 98, failed: 2, skipped: 0, total: 100 } },
        });
        delete hub.computed.flakyTestRate;

        const entries: FlakinessEntry[] = [
            {
                title: 'Flaky Test A',
                project: 'test',
                passCount: 75,
                failCount: 25,
                skipCount: 0,
                totalRuns: 100,
                rate: 0.25,
            },
        ];

        const html = generateFlakinessHtml(entries, 'Flakiness', { dataHub: hub });

        const rateValue = /data-part="label">Flaky Rate<\/div>\s*<div data-part="value">([^<]+)<\/div>/.exec(html)?.[1];

        // Without flakyTestRate → N/A (not 0%, not 1%, not silent default)
        expect(rateValue).toBe('N/A');
    });
});
