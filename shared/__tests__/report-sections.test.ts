/**
 * Tests for report-sections — HTML UI section builders.
 *
 * NOTE: report-sections integrates with the real local `report-table` module
 * (buildTestTable). The local module is NOT mocked — anti-mock-theater (T3):
 * the flow must run real and integrated (AGENTS §26.2).
 */

import { nonNull } from '../test-utils.js';
import type { FlatTest } from '../result_parser.js';
import type { TestRunTab, ReportOptions, ReportStats } from '../report/report-types.js';
import type { SuiteBreakdown, ComputedMetrics } from '../types/data-hub.js';
import type { QualityGateResult, QualityGateStatus } from '../quality/quality-gate.js';
import {
    buildTabs,
    buildTabContents,
    buildHierarchySidebar,
    buildTimeline,
    buildSummaryCards,
    buildLlmSection,
    buildQualityGateSection,
    buildFilterBar,
    buildFailedSummary,
    buildReleaseSection,
    buildHealthSection,
} from '../report/report-sections.js';

const sampleTests: FlatTest[] = [
    { title: 'TC01', state: 'passed', duration: 100 },
    { title: 'TC02', state: 'failed', duration: 200 },
    { title: 'TC03', state: 'skipped', duration: 0 },
];

function suiteBreakdownFromTests(tests: FlatTest[]): SuiteBreakdown[] {
    const map = new Map<string, SuiteBreakdown>();
    for (const t of tests) {
        const suite = '(root)';
        let agg = map.get(suite);
        if (!agg) {
            agg = { suite, passed: 0, failed: 0, skipped: 0, totalDuration: 0, tests: [] };
            map.set(suite, agg);
        }
        if (t.state === 'passed') agg.passed++;
        else if (t.state === 'failed') agg.failed++;
        else agg.skipped++;
        agg.totalDuration += t.duration;
        agg.tests.push(t);
    }
    return Array.from(map.values());
}

function computedWith(tests: FlatTest[]): Partial<ComputedMetrics> {
    return { suiteBreakdown: suiteBreakdownFromTests(tests) };
}

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
    it('renders explicit empty-state for empty tests (I-5/F2, Rule 25)', () => {
        expect(buildTimeline([])).toContain('data-component="empty-state"');
        expect(buildTimeline([])).toContain('No timeline data available');
    });

    it('returns timeline chart aggregated by suite', () => {
        const html = buildTimeline(sampleTests, computedWith(sampleTests) as ComputedMetrics);

        expect(html).toContain('Timeline');
        expect(html).toContain('timelineBody');
        expect(html).toContain('(root)');
        expect(html).toContain('data-component="badge"');
    });

    it('includes suite summary badges', () => {
        const html = buildTimeline(sampleTests, computedWith(sampleTests) as ComputedMetrics);

        expect(html).toContain('data-component="badge"');
    });

    it('handles zero-duration tests without division by zero', () => {
        const tests: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 0 },
            { title: 'T2', state: 'passed', duration: 0 },
        ];
        const html = buildTimeline(tests, computedWith(tests) as ComputedMetrics);

        expect(html).toContain('2 tests');
        expect(html).not.toBe('');
    });

    it('includes duration labels', () => {
        const html = buildTimeline(sampleTests, computedWith(sampleTests) as ComputedMetrics);

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

    it('uses svg icons for confidence levels instead of emoji codepoints', () => {
        expect.hasAssertions();

        for (const level of ['high', 'medium', 'low'] as const) {
            const html = buildLlmSection({ llmAnalysis: 'analysis', llmConfidence: level });

            expect(html).toContain('data-icon="circle"');
            expect(html).not.toContain('\u{1F7E2}');
            expect(html).not.toContain('\u{1F7E1}');
            expect(html).not.toContain('\u{1F534}');
        }
    });

    it('escapes HTML content in analysis text', () => {
        const opts: ReportOptions = { llmAnalysis: '<script>alert(1)</script>' };
        const html = buildLlmSection(opts);

        expect(html).not.toContain('<script>');
    });
});

describe('BuildQualityGateSection', () => {
    const gate = (
        overall: QualityGateStatus = 'pass',
        checks: QualityGateResult['checks'] = [],
    ): QualityGateResult => ({
        overall,
        checks,
        score: 85,
    });

    it('renders a structured section without a raw <pre> block', () => {
        const html = buildQualityGateSection(gate());

        expect(html).toContain('data-section="quality-gate"');
        expect(html).toContain('data-component="quality-gate"');
        expect(html).not.toContain('<pre>');
        expect(html).toContain('Score: 85/100');
    });

    it('reflects the overall status as a fail badge', () => {
        const html = buildQualityGateSection(gate('fail'));

        expect(html).toContain('data-variant="fail"');
        expect(html).toContain('fail');
    });

    it('renders every check with score, threshold and escaped details', () => {
        const html = buildQualityGateSection(
            gate('pass', [
                { name: 'pass-rate', status: 'pass', score: 92, threshold: 90, details: 'Pass rate: 92%' },
                { name: 'caution <x>', status: 'fail', score: 40, threshold: 90, details: '<script>alert(1)</script>' },
            ]),
        );

        expect(html).toContain(dataStatus('pass'));
        expect(html).toContain(dataStatus('fail'));
        expect(html).toContain('pass-rate');
        expect(html).toContain('92/90');
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;x&gt;');
    });

    it('surfaces a non-finite score as N/A — never a silent 0 (Rule 25)', () => {
        const html = buildQualityGateSection({ overall: 'pass', checks: [], score: Number.NaN });

        expect(html).toContain('Score: N/A/100');
        expect(html).not.toContain('Score: 0');
    });
});

function dataStatus(status: QualityGateStatus): string {
    return `data-status="${status}"`;
}

describe('BuildFilterBar', () => {
    it('returns filter bar HTML', () => {
        const html = buildFilterBar();

        expect(html).toContain('searchInput');
        expect(html).toContain('exportCsv');
        expect(html).toContain('window.print');
        expect(html).toContain('_toggleTheme');
    });

    it('wires theme toggle button to the global _toggleTheme function', () => {
        const html = buildFilterBar();

        expect(html).toContain('data-icon="moon"');
        expect(html).toContain('onclick="_toggleTheme()"');
        expect(html).not.toContain('onclick="toggleTheme()"');
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
            passRate: { score: 100, status: 'pass' as const, available: true },
            flakyRate: { score: 100, status: 'pass' as const, available: true },
            coverage: { score: 90, status: 'pass' as const, available: true },
            suiteSpeed: { score: 100, status: 'pass' as const, available: true },
            executionRate: { score: 100, status: 'pass' as const, available: true },
        },
        runCount: 10,
        timestamp: '2026-06-03T00:00:00.000Z',
    };

    const failingHealth = {
        overall: 45,
        grade: 'critical' as const,
        qualityGate: 'fail' as const,
        dimensions: {
            passRate: { score: 30, status: 'fail' as const, available: true },
            flakyRate: { score: 100, status: 'pass' as const, available: true },
            coverage: { score: 50, status: 'fail' as const, available: true },
            suiteSpeed: { score: 80, status: 'pass' as const, available: true },
            executionRate: { score: 100, status: 'pass' as const, available: true },
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
        expect(html).toContain('Cobertura de testes Jira (steps)');
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

    it('b2: renders the PARTIAL banner (with excluded dimensions) when health is partial', () => {
        const partialHealth = {
            ...passingHealth,
            partial: true,
            partialReasons: ['coverage: no data available', 'executionRate: no data available'],
        };
        const html = buildHealthSection(partialHealth);

        expect(html).toContain('PARTIAL');
        expect(html).toContain('insufficient data');
        expect(html).toContain('coverage: no data available');
    });

    it('does not render the PARTIAL banner when health is complete', () => {
        const html = buildHealthSection(passingHealth);

        expect(html).not.toContain('PARTIAL');
    });
});
