/**
 * Tests for report-sections — HTML UI section builders.
 */

vi.mock('./report-table', () => ({
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

describe('BuildTabs', () => {
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
            { name: 'A', tests: [nonNull(sampleTests[0])] },
            { name: 'B', tests: [nonNull(sampleTests[0])] },
        ];
        const html = buildTabs(runs);

        expect(html).toContain('active');
    });

    it('handles empty runs array gracefully', () => {
        expect(buildTabs([])).toBe('');
    });
});

describe('BuildTabContents', () => {
    it('returns empty string for single run', () => {
        expect(buildTabContents([{ name: 'Default', tests: sampleTests }])).toBe('');
    });

    it('returns tab contents for multiple runs', () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: [nonNull(sampleTests[0])] },
            { name: 'Firefox', tests: [nonNull(sampleTests[0])] },
        ];
        const html = buildTabContents(runs);

        expect(html).toContain('tabContent-0');
        expect(html).toContain('tabContent-1');
        expect(html).toContain('searchInput');
    });

    it('handles empty runs array', () => {
        expect(buildTabContents([])).toBe('');
    });
});

describe('BuildHierarchySidebar', () => {
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

describe('BuildTimeline', () => {
    it('returns empty string for empty tests', () => {
        expect(buildTimeline([])).toBe('');
    });

    it('returns timeline chart aggregated by suite', () => {
        const html = buildTimeline(sampleTests);

        expect(html).toContain('Timeline');
        expect(html).toContain('timelineBody');
        expect(html).toContain('(root)');
        expect(html).toContain('data-component="badge"');
    });

    it('includes suite summary badges', () => {
        const html = buildTimeline(sampleTests);

        expect(html).toContain('data-component="badge"');
    });

    it('handles zero-duration tests without division by zero', () => {
        const tests: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 0 },
            { title: 'T2', state: 'passed', duration: 0 },
        ];
        const html = buildTimeline(tests);

        expect(html).toContain('2 tests');
        expect(html).not.toBe('');
    });

    it('includes duration labels', () => {
        const html = buildTimeline(sampleTests);

        expect(html).toContain('0s');
    });
});

describe('BuildSummaryCards', () => {
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

    it('shows pass rate with severity', () => {
        const html = buildSummaryCards(sampleStats, 95);

        expect(html).toContain('data-severity');
    });
});

describe('BuildLlmSection', () => {
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

describe('BuildQualityGate', () => {
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

describe('BuildFilterBar', () => {
    it('returns filter bar HTML', () => {
        const html = buildFilterBar();

        expect(html).toContain('searchInput');
        expect(html).toContain('exportCsv');
        expect(html).toContain('window.print');
        expect(html).toContain('_toggleTheme');
    });
});

describe('BuildFailedSummary', () => {
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

describe('BuildReleaseSection', () => {
    it('renders score number', () => {
        const html = buildReleaseSection(85, 'good', [], 'All clear');

        expect(html).toContain('85');
    });

    it('renders grade text', () => {
        const html = buildReleaseSection(85, 'good', [], 'All clear');

        expect(html).toContain('good');
    });

    it('renders recommendation', () => {
        const html = buildReleaseSection(50, 'needs_attention', [], 'Fix the failing checks');

        expect(html).toContain('Fix the failing checks');
    });

    it('renders breakdown items with pass/fail status', () => {
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

    it('is wrapped in release-readiness div', () => {
        const html = buildReleaseSection(95, 'excellent', [], 'Ready');

        expect(html).toContain('release-readiness');
    });

    it('color-codes score based on threshold', () => {
        const high = buildReleaseSection(85, 'good', [], '');

        expect(high).toContain('var(--color-success)');

        const mid = buildReleaseSection(65, 'needs_attention', [], '');

        expect(mid).toContain('var(--color-warn)');

        const low = buildReleaseSection(30, 'critical', [], '');

        expect(low).toContain('var(--color-error)');
    });
});

describe('BuildHealthSection', () => {
    const passingHealth = {
        overall: 95,
        grade: 'excellent' as const,
        qualityGate: 'pass' as const,
        dimensions: {
            passRate: { score: 100, status: 'pass' as const },
            flakyRate: { score: 100, status: 'pass' as const },
            coverage: { score: 90, status: 'pass' as const },
            suiteSpeed: { score: 100, status: 'pass' as const },
            executionRate: { score: 100, status: 'pass' as const },
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
            executionRate: { score: 100, status: 'pass' as const },
        },
        runCount: 5,
        timestamp: '2026-06-03T00:00:00.000Z',
    };

    it('renders overall score and grade', () => {
        const html = buildHealthSection(passingHealth);

        expect(html).toContain('95');
        expect(html).toContain('excellent');
    });

    it('shows passing quality gate for healthy suite', () => {
        const html = buildHealthSection(passingHealth);

        expect(html).toContain('Quality Gate: Pass');
    });

    it('shows failing quality gate for unhealthy suite', () => {
        const html = buildHealthSection(failingHealth);

        expect(html).toContain('Quality Gate: Fail');
    });

    it('renders dimension bars for each metric', () => {
        const html = buildHealthSection(passingHealth);

        expect(html).toContain('Pass Rate');
        expect(html).toContain('Flaky Rate');
        expect(html).toContain('Coverage');
        expect(html).toContain('Suite Speed');
        expect(html).toContain('Execution Rate');
    });

    it('shows run count and date', () => {
        const html = buildHealthSection(passingHealth);

        expect(html).toContain('10 run(s)');
        expect(html).toContain('2026-06-03');
    });

    it('renders provenance when healthScore has provenance data', () => {
        const healthWithProvenance = {
            ...passingHealth,
            provenance: [
                {
                    dimension: 'passRate',
                    source: 'DORA',
                    standard: 'DORA',
                    formula: 'passed/(passed+failed)×100',
                    thresholdBasis: 'Elite ≥95%',
                    configurable: true,
                },
                {
                    dimension: 'flakyRate',
                    source: 'QASkills.sh',
                    standard: 'Industry Best Practice',
                    formula: 'flaky/total×100',
                    thresholdBasis: 'Target <3%',
                    configurable: false,
                },
            ],
        };
        const html = buildHealthSection(healthWithProvenance);

        expect(html).toContain('Methodology & References');
        expect(html).toContain('passed/(passed+failed)×100');
        expect(html).toContain('DORA');
    });

    it('does not render provenance section when provenance is absent', () => {
        const html = buildHealthSection(passingHealth);

        expect(html).not.toContain('Methodology & References');
    });

    it('does not render provenance section when provenance is empty', () => {
        const healthEmptyProvenance = { ...passingHealth, provenance: [] };
        const html = buildHealthSection(healthEmptyProvenance);

        expect(html).not.toContain('Methodology & References');
    });
});
