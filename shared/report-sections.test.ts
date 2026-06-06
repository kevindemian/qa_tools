/**
 * Tests for report-sections — HTML UI section builders.
 */

vi.mock('./report-table', async () => ({
    buildTestTable: vi.fn(() => '<table>mock</table>'),
}));

import { nonNull } from './test-utils.js';
import type { FlatTest } from './result_parser.js';
import type { TestRunTab, ReportOptions, ReportStats } from './report-types.js';
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
    buildReleaseSection,
    buildHealthSection,
} from './report-sections.js';

const sampleTests: FlatTest[] = [
    { title: 'TC01', state: 'passed', duration: 100 },
    { title: 'TC02', state: 'failed', duration: 200 },
    { title: 'TC03', state: 'skipped', duration: 0 },
];

const sampleStats: ReportStats = { passed: 1, failed: 1, skipped: 1, total: 3, duration: 300 };

describe('buildTabs', () => {
    it('returns empty string for single run', async () => {
        expect(buildTabs([{ name: 'Default', tests: sampleTests }])).toBe('');
    });

    it('returns tab buttons for multiple runs', async () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: sampleTests },
            { name: 'Firefox', tests: sampleTests },
        ];
        const html = buildTabs(runs);
        expect(html).toContain('Chrome');
        expect(html).toContain('Firefox');
        expect(html).toContain('switchTab');
    });

    it('first tab is marked active', async () => {
        const runs: TestRunTab[] = [
            { name: 'A', tests: [nonNull(sampleTests[0])] },
            { name: 'B', tests: [nonNull(sampleTests[0])] },
        ];
        const html = buildTabs(runs);
        expect(html).toContain('active');
    });

    it('handles empty runs array gracefully', async () => {
        expect(buildTabs([])).toBe('');
    });
});

describe('buildTabContents', () => {
    it('returns empty string for single run', async () => {
        expect(buildTabContents([{ name: 'Default', tests: sampleTests }])).toBe('');
    });

    it('returns tab contents for multiple runs', async () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: [nonNull(sampleTests[0])] },
            { name: 'Firefox', tests: [nonNull(sampleTests[0])] },
        ];
        const html = buildTabContents(runs);
        expect(html).toContain('tabContent-0');
        expect(html).toContain('tabContent-1');
        expect(html).toContain('searchInput');
    });

    it('handles empty runs array', async () => {
        expect(buildTabContents([])).toBe('');
    });
});

describe('buildHierarchySidebar', () => {
    it('returns empty string for tests without suite info', async () => {
        const html = buildHierarchySidebar(sampleTests);
        expect(html).toBe('');
    });

    it('includes suites from tests with hierarchy', async () => {
        const testsWithSuite: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 10, fullTitle: 'Login > T1' },
            { title: 'T2', state: 'passed', duration: 10, fullTitle: 'Dashboard > T2' },
        ];
        const html = buildHierarchySidebar(testsWithSuite);
        expect(html).toContain('Login');
        expect(html).toContain('Dashboard');
        expect(html).toContain('tree-node');
    });

    it('deduplicates suites', async () => {
        const tests: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 10, fullTitle: 'Login > T1' },
            { title: 'T2', state: 'passed', duration: 10, fullTitle: 'Login > T2' },
        ];
        const html = buildHierarchySidebar(tests);
        const occurrences = html.split('Login').length - 1;
        expect(occurrences).toBe(2);
    });

    it('adds clear filter link', async () => {
        const tests: FlatTest[] = [{ title: 'T', state: 'passed', duration: 10, fullTitle: 'Suite > T' }];
        const html = buildHierarchySidebar(tests);
        expect(html).toContain('Clear filter');
    });
});

describe('buildTimeline', () => {
    it('returns empty string for empty tests', async () => {
        expect(buildTimeline([])).toBe('');
    });

    it('returns timeline chart for tests with durations', async () => {
        const html = buildTimeline(sampleTests);
        expect(html).toContain('Timeline');
        expect(html).toContain('timelineBody');
        expect(html).toContain('TC01');
        expect(html).toContain('TC02');
    });

    it('includes state badges', async () => {
        const html = buildTimeline(sampleTests);
        expect(html).toContain('data-component="badge"');
    });

    it('handles zero-duration tests without division by zero', async () => {
        const tests: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 0 },
            { title: 'T2', state: 'passed', duration: 0 },
        ];
        const html = buildTimeline(tests);
        expect(html).toContain('T1');
        expect(html).not.toBe('');
    });

    it('includes duration labels', async () => {
        const html = buildTimeline(sampleTests);
        expect(html).toContain('0s');
    });
});

describe('buildSummaryCards', () => {
    it('builds cards for each stat', async () => {
        const html = buildSummaryCards(sampleStats, 33.3);
        expect(html).toContain('Passed');
        expect(html).toContain('Failed');
        expect(html).toContain('Skipped');
        expect(html).toContain('Total');
        expect(html).toContain('Duration');
        expect(html).toContain('Pass Rate');
    });

    it('displays correct counts', async () => {
        const html = buildSummaryCards(sampleStats, 33.3);
        expect(html).toContain('>1 <');
        expect(html).toContain('>3<');
    });

    it('handles zero stats', async () => {
        const zero: ReportStats = { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 };
        const html = buildSummaryCards(zero, 0);
        expect(html).toContain('0.0%');
    });

    it('shows pass rate with severity', async () => {
        const html = buildSummaryCards(sampleStats, 95);
        expect(html).toContain('data-severity');
    });
});

describe('buildLlmSection', () => {
    it('returns empty string when no llmAnalysis', async () => {
        const opts: ReportOptions = {};
        expect(buildLlmSection(opts)).toBe('');
    });

    it('shows fallback notice when llmFallback is true', async () => {
        const opts = { llmAnalysis: 'template', llmFallback: true };
        const html = buildLlmSection(opts);
        expect(html).toContain('unavailable');
        expect(html).toContain('template');
    });

    it('includes confidence badge when available', async () => {
        const opts: ReportOptions = { llmAnalysis: 'analysis', llmConfidence: 'high' };
        const html = buildLlmSection(opts);
        expect(html).toContain('Confiança');
        expect(html).toContain('high');
    });

    it('escapes HTML content in analysis text', async () => {
        const opts: ReportOptions = { llmAnalysis: '<script>alert(1)</script>' };
        const html = buildLlmSection(opts);
        expect(html).not.toContain('<script>');
    });
});

describe('buildQualityGate', () => {
    it('returns empty string when pass rate meets threshold', async () => {
        expect(buildQualityGate(95, 90)).toBe('');
    });

    it('warns when pass rate is below threshold', async () => {
        const html = buildQualityGate(75, 90);
        expect(html).toContain('Quality Gate Failed');
        expect(html).toContain('75.0%');
    });

    it('displays exact threshold value', async () => {
        const html = buildQualityGate(50, 75);
        expect(html).toContain('75%');
    });

    it('handles zero pass rate', async () => {
        const html = buildQualityGate(0, 50);
        expect(html).toContain('0.0%');
    });
});

describe('buildFilterBar', () => {
    it('returns filter bar HTML', async () => {
        const html = buildFilterBar();
        expect(html).toContain('searchInput');
        expect(html).toContain('exportCsv');
        expect(html).toContain('window.print');
        expect(html).toContain('_toggleTheme');
    });
});

describe('buildFailedSummary', () => {
    it('returns empty string when no failures', async () => {
        const allPassed: ReportStats = { passed: 5, failed: 0, skipped: 0, total: 5, duration: 500 };
        expect(buildFailedSummary([], allPassed)).toBe('');
    });

    it('lists failed tests when failures exist', async () => {
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

    it('includes duration for failed tests', async () => {
        const failedTests: FlatTest[] = [{ title: 'F1', state: 'failed', duration: 300 }];
        const stats: ReportStats = { passed: 0, failed: 1, skipped: 0, total: 1, duration: 300 };
        const html = buildFailedSummary(failedTests, stats);
        expect(html).toContain('0s');
    });

    it('escapes HTML in test titles', async () => {
        const failedTests: FlatTest[] = [{ title: '<b>XSS</b>', state: 'failed', duration: 100 }];
        const stats: ReportStats = { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 };
        const html = buildFailedSummary(failedTests, stats);
        expect(html).toContain('&lt;b&gt;');
    });
});

describe('buildReleaseSection', () => {
    it('renders score number', async () => {
        const html = buildReleaseSection(85, 'good', [], 'All clear');
        expect(html).toContain('85');
    });

    it('renders grade text', async () => {
        const html = buildReleaseSection(85, 'good', [], 'All clear');
        expect(html).toContain('good');
    });

    it('renders recommendation', async () => {
        const html = buildReleaseSection(50, 'needs_attention', [], 'Fix the failing checks');
        expect(html).toContain('Fix the failing checks');
    });

    it('renders breakdown items with pass/fail status', async () => {
        const breakdown = [
            { label: 'Tests', score: 90, status: 'pass' as const },
            { label: 'Coverage', score: 30, status: 'fail' as const },
        ];
        const html = buildReleaseSection(60, 'needs_attention', breakdown, 'Improve coverage');
        expect(html).toContain('Tests');
        expect(html).toContain('Coverage');
        expect(html).toContain('pass');
        expect(html).toContain('fail');
        expect(html).toContain('90');
        expect(html).toContain('30');
    });

    it('is wrapped in release-readiness div', async () => {
        const html = buildReleaseSection(95, 'excellent', [], 'Ready');
        expect(html).toContain('release-readiness');
    });

    it('color-codes score based on threshold', async () => {
        const high = buildReleaseSection(85, 'good', [], '');
        expect(high).toContain('var(--color-success)');
        const mid = buildReleaseSection(65, 'needs_attention', [], '');
        expect(mid).toContain('var(--color-warn)');
        const low = buildReleaseSection(30, 'critical', [], '');
        expect(low).toContain('var(--color-error)');
    });
});

describe('buildHealthSection', () => {
    const passingHealth = {
        overall: 95,
        grade: 'excellent' as const,
        qualityGate: 'pass' as const,
        dimensions: {
            passRate: { score: 100, status: 'pass' as const },
            flakyRate: { score: 100, status: 'pass' as const },
            coverage: { score: 90, status: 'pass' as const },
            suiteSpeed: { score: 100, status: 'pass' as const },
        },
        runCount: 10,
        timestamp: '2026-06-03T00:00:00.000Z',
    };

    const failingHealth = {
        overall: 45,
        grade: 'critical' as const,
        qualityGate: 'fail' as const,
        dimensions: {
            passRate: { score: 30, status: 'fail' as const },
            flakyRate: { score: 100, status: 'pass' as const },
            coverage: { score: 50, status: 'fail' as const },
            suiteSpeed: { score: 80, status: 'pass' as const },
        },
        runCount: 5,
        timestamp: '2026-06-03T00:00:00.000Z',
    };

    it('renders overall score and grade', async () => {
        const html = buildHealthSection(passingHealth);
        expect(html).toContain('95');
        expect(html).toContain('excellent');
    });

    it('shows passing quality gate for healthy suite', async () => {
        const html = buildHealthSection(passingHealth);
        expect(html).toContain('Quality Gate: Pass');
    });

    it('shows failing quality gate for unhealthy suite', async () => {
        const html = buildHealthSection(failingHealth);
        expect(html).toContain('Quality Gate: Fail');
    });

    it('renders dimension bars for each metric', async () => {
        const html = buildHealthSection(passingHealth);
        expect(html).toContain('Pass Rate');
        expect(html).toContain('Flaky Rate');
        expect(html).toContain('Coverage');
        expect(html).toContain('Suite Speed');
    });

    it('shows run count and date', async () => {
        const html = buildHealthSection(passingHealth);
        expect(html).toContain('10 run(s)');
        expect(html).toContain('2026-06-03');
    });
});
