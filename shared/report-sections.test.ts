/** Tests for report-sections — HTML UI section builders. */
jest.mock('./theme', () => ({
    getTheme: jest.fn(() => ({
        colors: { success: '#22c55e', error: '#ef4444', warn: '#facc15', primary: '#6366f1' },
    })),
}));

jest.mock('./report-table', () => ({
    buildTestTable: jest.fn(() => '<table>mock</table>'),
}));

import type { FlatTest } from './result_parser';
import type { TestRunTab, ReportOptions, ReportStats } from './report-types';
import {
    buildTabs,
    buildTabContents,
    buildHierarchySidebar,
    buildTimeline,
    buildSummaryCards,
    buildLlmSection,
    buildQualityGate,
    buildFilterBar,
    buildFailedSummary,
} from './report-sections';

const sampleTests: FlatTest[] = [
    { title: 'TC01', state: 'passed', duration: 100 },
    { title: 'TC02', state: 'failed', duration: 200 },
    { title: 'TC03', state: 'skipped', duration: 0 },
];

const sampleStats: ReportStats = { passed: 1, failed: 1, skipped: 1, total: 3, duration: 300 };

describe('buildTabs', () => {
    it('returns empty string for single run', () => {
        expect(buildTabs([{ name: 'Default', tests: sampleTests }])).toBe('');
    });

    it('returns tab buttons for multiple runs', () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: sampleTests },
            { name: 'Firefox', tests: sampleTests },
        ];
        const html = buildTabs(runs);
        expect(html).toContain('Chrome');
        expect(html).toContain('Firefox');
        expect(html).toContain('switchTab');
    });

    it('first tab is marked active', () => {
        const runs: TestRunTab[] = [
            { name: 'A', tests: [sampleTests[0]!] },
            { name: 'B', tests: [sampleTests[0]!] },
        ];
        const html = buildTabs(runs);
        expect(html).toContain('active');
    });

    it('handles empty runs array gracefully', () => {
        expect(buildTabs([])).toBe('');
    });
});

describe('buildTabContents', () => {
    it('returns empty string for single run', () => {
        expect(buildTabContents([{ name: 'Default', tests: sampleTests }])).toBe('');
    });

    it('returns tab contents for multiple runs', () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: [sampleTests[0]!] },
            { name: 'Firefox', tests: [sampleTests[0]!] },
        ];
        const html = buildTabContents(runs);
        expect(html).toContain('tabContent-0');
        expect(html).toContain('tabContent-1');
        expect(html).toContain('control-bar');
    });

    it('handles empty runs array', () => {
        expect(buildTabContents([])).toBe('');
    });
});

describe('buildHierarchySidebar', () => {
    it('returns empty string for tests without suite info', () => {
        const html = buildHierarchySidebar(sampleTests);
        expect(html).toBe('');
    });

    it('includes suites from tests with hierarchy', () => {
        const testsWithSuite: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 10, fullTitle: 'Login > T1' },
            { title: 'T2', state: 'passed', duration: 10, fullTitle: 'Dashboard > T2' },
        ];
        const html = buildHierarchySidebar(testsWithSuite);
        expect(html).toContain('Login');
        expect(html).toContain('Dashboard');
        expect(html).toContain('tree-node');
    });

    it('deduplicates suites', () => {
        const tests: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 10, fullTitle: 'Login > T1' },
            { title: 'T2', state: 'passed', duration: 10, fullTitle: 'Login > T2' },
        ];
        const html = buildHierarchySidebar(tests);
        const occurrences = html.split('Login').length - 1;
        expect(occurrences).toBe(2);
    });

    it('adds clear filter link', () => {
        const tests: FlatTest[] = [{ title: 'T', state: 'passed', duration: 10, fullTitle: 'Suite > T' }];
        const html = buildHierarchySidebar(tests);
        expect(html).toContain('Clear filter');
    });
});

describe('buildTimeline', () => {
    it('returns empty string for empty tests', () => {
        expect(buildTimeline([])).toBe('');
    });

    it('returns timeline chart for tests with durations', () => {
        const html = buildTimeline(sampleTests);
        expect(html).toContain('Timeline');
        expect(html).toContain('timelineBody');
        expect(html).toContain('TC01');
        expect(html).toContain('TC02');
    });

    it('includes state badges', () => {
        const html = buildTimeline(sampleTests);
        expect(html).toContain('status-passed');
        expect(html).toContain('status-failed');
        expect(html).toContain('status-skipped');
    });

    it('handles zero-duration tests without division by zero', () => {
        const tests: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 0 },
            { title: 'T2', state: 'passed', duration: 0 },
        ];
        const html = buildTimeline(tests);
        expect(html).toContain('T1');
        expect(html).not.toBe('');
    });

    it('includes duration labels', () => {
        const html = buildTimeline(sampleTests);
        expect(html).toContain('0s');
    });
});

describe('buildSummaryCards', () => {
    it('builds cards for each stat', () => {
        const html = buildSummaryCards(sampleStats, 33.3);
        expect(html).toContain('Passed');
        expect(html).toContain('Failed');
        expect(html).toContain('Skipped');
        expect(html).toContain('Total');
        expect(html).toContain('Duration');
        expect(html).toContain('Pass Rate');
    });

    it('displays correct counts', () => {
        const html = buildSummaryCards(sampleStats, 33.3);
        expect(html).toContain('>1 <');
        expect(html).toContain('>3<');
    });

    it('handles zero stats', () => {
        const zero: ReportStats = { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 };
        const html = buildSummaryCards(zero, 0);
        expect(html).toContain('0.0%');
    });

    it('shows pass rate in appropriate class', () => {
        const html = buildSummaryCards(sampleStats, 95);
        expect(html).toContain('rate-good');
    });
});

describe('buildLlmSection', () => {
    it('returns empty string when no llmAnalysis', () => {
        const opts: ReportOptions = {};
        expect(buildLlmSection(opts)).toBe('');
    });

    it('shows fallback notice when llmFallback is true', () => {
        const opts = { llmAnalysis: 'template', llmFallback: true };
        const html = buildLlmSection(opts);
        expect(html).toContain('unavailable');
        expect(html).toContain('template');
    });

    it('includes confidence badge when available', () => {
        const opts: ReportOptions = { llmAnalysis: 'analysis', llmConfidence: 'high' };
        const html = buildLlmSection(opts);
        expect(html).toContain('Confiança');
        expect(html).toContain('high');
    });

    it('escapes HTML content in analysis text', () => {
        const opts: ReportOptions = { llmAnalysis: '<script>alert(1)</script>' };
        const html = buildLlmSection(opts);
        expect(html).not.toContain('<script>');
    });
});

describe('buildQualityGate', () => {
    it('returns empty string when pass rate meets threshold', () => {
        expect(buildQualityGate(95, 90)).toBe('');
    });

    it('warns when pass rate is below threshold', () => {
        const html = buildQualityGate(75, 90);
        expect(html).toContain('Quality Gate Failed');
        expect(html).toContain('75.0%');
    });

    it('displays exact threshold value', () => {
        const html = buildQualityGate(50, 75);
        expect(html).toContain('75%');
    });

    it('handles zero pass rate', () => {
        const html = buildQualityGate(0, 50);
        expect(html).toContain('0.0%');
    });
});

describe('buildFilterBar', () => {
    it('returns filter bar HTML', () => {
        const html = buildFilterBar();
        expect(html).toContain('searchInput');
        expect(html).toContain('exportCsv');
        expect(html).toContain('window.print');
        expect(html).toContain('toggleTheme');
    });
});

describe('buildFailedSummary', () => {
    it('returns empty string when no failures', () => {
        const allPassed: ReportStats = { passed: 5, failed: 0, skipped: 0, total: 5, duration: 500 };
        expect(buildFailedSummary([], allPassed)).toBe('');
    });

    it('lists failed tests when failures exist', () => {
        const failedTests: FlatTest[] = [
            { title: 'F1', state: 'failed', duration: 200 },
            { title: 'F2', state: 'failed', duration: 150 },
        ];
        const stats: ReportStats = { passed: 0, failed: 2, skipped: 0, total: 2, duration: 350 };
        const html = buildFailedSummary(failedTests, stats);
        expect(html).toContain('F1');
        expect(html).toContain('F2');
        expect(html).toContain('Failed Tests');
    });

    it('includes duration for failed tests', () => {
        const failedTests: FlatTest[] = [{ title: 'F1', state: 'failed', duration: 300 }];
        const stats: ReportStats = { passed: 0, failed: 1, skipped: 0, total: 1, duration: 300 };
        const html = buildFailedSummary(failedTests, stats);
        expect(html).toContain('0s');
    });

    it('escapes HTML in test titles', () => {
        const failedTests: FlatTest[] = [{ title: '<b>XSS</b>', state: 'failed', duration: 100 }];
        const stats: ReportStats = { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 };
        const html = buildFailedSummary(failedTests, stats);
        expect(html).toContain('&lt;b&gt;');
    });
});
