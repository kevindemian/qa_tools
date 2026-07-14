import { buildTraceabilityMatrix, generateTraceabilityHtml } from './traceability-matrix.js';
import type { MetricsRun, FlakyResult, RawData } from './types/data-hub.js';
import type { QualityCategory, QualityReport } from './data-hub/quality.js';
import type { DataSource } from './types/data-hub.js';
import { rootLogger } from './logger.js';
import { nonNull } from './test-utils.js';
import { createTestHub } from './__tests__/test-hub.js';
import { makeDataHubMock } from './test-utils/factories/data-hub-mock.js';

/** Wrapper que injeta DataHub (SSOT) obrigatório, com flakyRate opcional. */
function matrix(
    metrics: MetricsRun[],
    coverage?: Parameters<typeof buildTraceabilityMatrix>[1],
    flakyRate?: FlakyResult[],
): ReturnType<typeof buildTraceabilityMatrix> {
    return buildTraceabilityMatrix(metrics, coverage, createTestHub({ flakyRate: flakyRate ?? [] }));
}

function emptyMetrics(): MetricsRun[] {
    return [];
}

function singleRunMetrics(
    tests: Array<{ title: string; state: 'passed' | 'failed' | 'skipped'; duration: number }>,
): MetricsRun[] {
    return [
        {
            timestamp: '2026-01-01T00:00:00.000Z',
            project: 'test',
            total: tests.length,
            passed: tests.filter((t) => t.state === 'passed').length,
            failed: tests.filter((t) => t.state === 'failed').length,
            skipped: tests.filter((t) => t.state === 'skipped').length,
            duration: tests.reduce((s, t) => s + t.duration, 0),
            tests: tests.map((t) => ({
                title: t.title,
                state: t.state,
                duration: t.duration,
            })),
        },
    ];
}

describe('BuildTraceabilityMatrix', () => {
    it('returns empty result for empty metrics', () => {
        const result = matrix(emptyMetrics());

        expect(result.nodes).toStrictEqual([]);
        expect(result.totalEpics).toBe(0);
        expect(result.totalTests).toBe(0);
        expect(result.overallCoverage).toBe(0);
        expect(result.timestamp).toBeTruthy();
    });

    it('returns empty result when no coverage data provided', () => {
        const metrics = singleRunMetrics([{ title: 'Test A', state: 'passed', duration: 100 }]);
        const result = matrix(metrics);

        expect(result.nodes).toStrictEqual([]);
        expect(result.totalEpics).toBe(0);
    });

    it('builds single epic with passed tests', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-001', state: 'passed', duration: 200 },
            { title: 'TC-002', state: 'passed', duration: 150 },
        ]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        expect(result.nodes).toHaveLength(1);

        const node = nonNull(result.nodes[0]);

        expect(node.epic).toBe('EPIC-1');
        expect(node.coverage).toBe(100);
        expect(node.health).toBe(100);
        expect(node.stories).toHaveLength(1);
        expect(nonNull(node.stories[0]).tests).toHaveLength(2);
    });

    it('computes health based on pass rate', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-001', state: 'passed', duration: 100 },
            { title: 'TC-002', state: 'failed', duration: 50 },
            { title: 'TC-003', state: 'passed', duration: 75 },
        ]);
        const result = matrix(metrics, {
            items: [
                { epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002', 'TC-003'], issueKey: 'STORY-1' },
            ],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        const node = nonNull(result.nodes[0]);

        expect(node.health).toBe(67);
        expect(result.totalTests).toBe(3);
        expect(result.overallCoverage).toBe(67);
    });

    it('handles skipped tests', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-001', state: 'passed', duration: 100 },
            { title: 'TC-002', state: 'skipped', duration: 0 },
        ]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        const node = nonNull(result.nodes[0]);

        expect(node.health).toBe(50);
        expect(nonNull(node.stories[0]).tests).toHaveLength(2);
        expect(nonNull(node.stories[0]).tests[1]?.status).toBe('skipped');
    });

    it('builds multiple epics with mixed status', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-A1', state: 'passed', duration: 100 },
            { title: 'TC-A2', state: 'passed', duration: 200 },
            { title: 'TC-B1', state: 'failed', duration: 50 },
        ]);
        const result = matrix(metrics, {
            items: [
                { epic: 'EPIC-A', hasTest: true, linkedTestKeys: ['TC-A1', 'TC-A2'], issueKey: 'STORY-A1' },
                { epic: 'EPIC-B', hasTest: true, linkedTestKeys: ['TC-B1'], issueKey: 'STORY-B1' },
            ],
            totals: { total: 2, covered: 2 },
            byEpic: {
                'EPIC-A': { total: 1, covered: 1, rawPct: 100 },
                'EPIC-B': { total: 1, covered: 1, rawPct: 100 },
            },
        });

        expect(result.nodes).toHaveLength(2);
        expect(result.totalEpics).toBe(2);
        expect(result.totalTests).toBe(3);

        const epicA = nonNull(result.nodes.find((n) => n.epic === 'EPIC-A'));
        const epicB = nonNull(result.nodes.find((n) => n.epic === 'EPIC-B'));

        expect(epicA.health).toBe(100);
        expect(epicB.health).toBe(0);
        expect(result.overallCoverage).toBe(67);
    });

    it('handles stories with no linked tests gracefully', () => {
        const metrics = singleRunMetrics([]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: false, linkedTestKeys: [] }],
            totals: { total: 1, covered: 0 },
            byEpic: { 'EPIC-1': { total: 1, covered: 0, rawPct: 0 } },
        });

        const node = nonNull(result.nodes[0]);

        expect(node.coverage).toBe(0);
        expect(node.stories).toHaveLength(0);
        expect(node.health).toBe(0);
    });

    it('handles coverage result with no items array', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        expect(result.nodes).toHaveLength(1);
        expect(nonNull(result.nodes[0]).stories).toHaveLength(0);
        expect(nonNull(result.nodes[0]).coverage).toBe(100);
    });

    it('handles unmatched test keys gracefully', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['UNKNOWN-TEST'] }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        expect(nonNull(result.nodes[0]).stories).toHaveLength(0);
        expect(result.totalTests).toBe(0);
    });

    it('handles duplicate test titles in the same run', () => {
        const metrics: MetricsRun[] = [
            {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'test',
                total: 2,
                passed: 1,
                failed: 1,
                skipped: 0,
                duration: 150,
                tests: [
                    { title: 'TC-001', state: 'passed', duration: 100 },
                    { title: 'TC-001', state: 'passed', duration: 50 },
                ],
            },
        ];
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        expect(result.nodes).toHaveLength(1);
        expect(nonNull(nonNull(result.nodes[0]).stories[0]).tests).toHaveLength(1);
        expect(nonNull(nonNull(result.nodes[0]).stories[0]).tests[0]?.status).toBe('passed');
    });

    it('handles multiple items for the same epic', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-001', state: 'passed', duration: 100 },
            { title: 'TC-002', state: 'failed', duration: 50 },
        ]);
        const result = matrix(metrics, {
            items: [
                { epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001'], issueKey: 'STORY-1' },
                { epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-002'], issueKey: 'STORY-2' },
            ],
            totals: { total: 2, covered: 2 },
            byEpic: { 'EPIC-1': { total: 2, covered: 2, rawPct: 100 } },
        });
        const node = nonNull(result.nodes[0]);

        expect(node.stories).toHaveLength(2);
        expect(node.health).toBe(50);
    });

    it('handles item where hasTest is false but tests exist', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: false, linkedTestKeys: ['TC-001'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 0 },
            byEpic: { 'EPIC-1': { total: 1, covered: 0, rawPct: 0 } },
        });
        const story = nonNull(nonNull(result.nodes[0]).stories[0]);

        expect(story.coverage).toBe(0);
        expect(story.tests).toHaveLength(1);
    });

    it('handles item without linkedTestKeys', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        expect(nonNull(result.nodes[0]).stories).toHaveLength(0);
    });

    it('handles item without issueKey', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001'] }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });
        const story = nonNull(nonNull(result.nodes[0]).stories[0]);

        expect(story.key).toBe('EPIC-1');
    });

    it('handles error gracefully when metrics store is malformed', () => {
        vi.spyOn(rootLogger, 'error').mockImplementation(() => {});
        const result = matrix({} as MetricsRun[]);

        expect(result.nodes).toStrictEqual([]);
        expect(result.totalEpics).toBe(0);

        vi.restoreAllMocks();
    });

    it('has progress on flakiness from multiple runs', () => {
        const metrics: MetricsRun[] = [
            {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'test',
                total: 1,
                passed: 0,
                failed: 1,
                skipped: 0,
                duration: 50,
                tests: [{ title: 'TC-001', state: 'failed', duration: 50 }],
            },
            {
                timestamp: '2026-01-02T00:00:00.000Z',
                project: 'test',
                total: 1,
                passed: 1,
                failed: 0,
                skipped: 0,
                duration: 100,
                tests: [{ title: 'TC-001', state: 'passed', duration: 100 }],
            },
        ];
        const result = matrix(
            metrics,
            {
                items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001'], issueKey: 'STORY-1' }],
                totals: { total: 1, covered: 1 },
                byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
            },
            [{ title: 'TC-001', rate: 50, runs: 2 }],
        );

        const firstTest = nonNull(nonNull(result.nodes[0]).stories[0]).tests[0];

        expect(firstTest?.flakiness).toBe(0.5);
        expect(firstTest?.status).toBe('passed');
    });
});

describe('GenerateTraceabilityHtml', () => {
    it('generates valid HTML with summary cards', () => {
        const result = matrix(emptyMetrics(), {
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: [], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
        });
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('Total Epics');
        expect(html).toContain('Total Tests');
        expect(html).toContain('Overall Coverage');
    });

    it('contains tree structure with epic nodes', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('epic-node');
        expect(html).toContain('story-node');
        expect(html).toContain('test-row');
        expect(html).toContain('EPIC-1');
        expect(html).toContain('STORY-1');
        expect(html).toContain('TC-001');
    });

    it('color-codes test rows by status', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-PASS', state: 'passed', duration: 100 },
            { title: 'TC-FAIL', state: 'failed', duration: 50 },
            { title: 'TC-SKIP', state: 'skipped', duration: 0 },
        ]);
        const result = matrix(metrics, {
            items: [
                {
                    epic: 'EPIC-1',
                    hasTest: true,
                    linkedTestKeys: ['TC-PASS', 'TC-FAIL', 'TC-SKIP'],
                    issueKey: 'STORY-1',
                },
            ],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('test-passed');
        expect(html).toContain('test-failed');
        expect(html).toContain('test-skipped');
        expect(html).toContain('status-passed');
        expect(html).toContain('status-failed');
        expect(html).toContain('status-skipped');
    });

    it('shows empty state when no nodes', () => {
        const result = matrix(emptyMetrics());
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('No traceability data available');
        expect(html).not.toContain('class="epic-node"');
    });

    it('uses custom title', () => {
        const result = matrix(emptyMetrics());
        const html = generateTraceabilityHtml(result, 'My Traceability');

        expect(html).toContain('My Traceability');
        expect(html).toContain('<title>My Traceability</title>');
    });

    it('includes theme script and footer', () => {
        const result = matrix(emptyMetrics());
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('qa-report-theme');
        expect(html).toContain('Generated by QA Tools');
        expect(html).toContain('prefers-color-scheme');
    });

    it('escapes HTML in epic names', () => {
        const result: ReturnType<typeof buildTraceabilityMatrix> = {
            nodes: [
                {
                    epic: '<script>alert(1)</script>',
                    coverage: 50,
                    health: 0,
                    flakiness: 0,
                    stories: [],
                },
            ],
            totalEpics: 1,
            totalTests: 0,
            overallCoverage: 0,
            timestamp: '2026-01-01T00:00:00.000Z',
            awareness: { categories: [], minConfidence: null },
        };
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });

    it('handles error gracefully when result is null', () => {
        vi.spyOn(rootLogger, 'error').mockImplementation(() => {});
        const html = generateTraceabilityHtml(null);

        expect(html).toContain('Error generating traceability matrix');

        vi.restoreAllMocks();
    });

    it('shows error severity for coverage below 50', () => {
        const result: ReturnType<typeof buildTraceabilityMatrix> = {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 30,
            timestamp: '2026-01-01T00:00:00.000Z',
            awareness: { categories: [], minConfidence: null },
        };
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('data-severity="error"');
    });

    it('shows warn severity for coverage between 50 and 80', () => {
        const result: ReturnType<typeof buildTraceabilityMatrix> = {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 65,
            timestamp: '2026-01-01T00:00:00.000Z',
            awareness: { categories: [], minConfidence: null },
        };
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('data-severity="warn"');
    });

    it('shows success severity for coverage above 80', () => {
        const result: ReturnType<typeof buildTraceabilityMatrix> = {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 95,
            timestamp: '2026-01-01T00:00:00.000Z',
            awareness: { categories: [], minConfidence: null },
        };
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('data-severity="success"');
    });

    it('includes health bar for nodes with stories', () => {
        const metrics = singleRunMetrics([{ title: 'TC-001', state: 'passed', duration: 100 }]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });
        const html = generateTraceabilityHtml(result);

        expect(html).toContain('health-bar');
        expect(html).toContain('health-fill');
    });

    it('renders health bar in warn range for epic with partial health', () => {
        const metrics = singleRunMetrics([
            { title: 'TC-001', state: 'passed', duration: 100 },
            { title: 'TC-002', state: 'failed', duration: 50 },
        ]);
        const result = matrix(metrics, {
            items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'], issueKey: 'STORY-1' }],
            totals: { total: 1, covered: 1 },
            byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
        });

        expect(nonNull(result.nodes[0]).health).toBe(50);

        const html = generateTraceabilityHtml(result);

        expect(html).toContain('health-bar');
    });
});

describe('EIXO C — traceability awareness (C-3c)', () => {
    it('surfaces cross-referenced categories with provenance confidence + getQuality() validity', () => {
        expect.hasAssertions();

        const provenance = new Map<string, DataSource>([
            ['pmIssues', { source: 'github', confidence: 0.8, timestamp: '2026-01-01T00:00:00.000Z' }],
            ['securityFindings', { source: 'github', confidence: 0.6, timestamp: '2026-01-01T00:00:00.000Z' }],
        ]);
        const quality: Partial<Record<QualityCategory, QualityReport>> = {
            pmIssues: { valid: true, issues: [] },
            securityFindings: { valid: false, issues: ['f1 schema gap'] },
        };
        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            pmIssues: [
                {
                    source: 'github',
                    id: 1,
                    key: 'PROJ-1',
                    title: 'story',
                    state: 'open',
                    labels: [],
                    createdAt: '2026-01-01',
                    confidence: 0.9,
                },
            ],
            securityFindings: [{ tool: 'codeql', severity: 'low', title: 'f1', confidence: 0.9 }],
        };
        const hub = makeDataHubMock({ raw, provenance, quality });

        const result = buildTraceabilityMatrix([], undefined, hub);

        const cats = result.awareness.categories;

        expect(cats).toHaveLength(2);

        const pm = cats.find((c) => c.category === 'pmIssues');

        expect(pm?.entities[0]).toStrictEqual({ id: 'PROJ-1', confidence: 0.8, valid: true });

        const sec = cats.find((c) => c.category === 'securityFindings');

        expect(sec?.entities[0]).toStrictEqual({ id: 'f1', confidence: 0.6, valid: false });

        expect(result.awareness.minConfidence).toBe(0.6);

        const html = generateTraceabilityHtml(result);

        expect(html).toContain('Cross-References');
        expect(html).toContain('PROJ-1');
        expect(html).toContain('⚠ invalid');
    });

    it('omits the awareness panel when no ST-1 category is present', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock({
            raw: { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
        });
        const result = buildTraceabilityMatrix([], undefined, hub);

        expect(result.awareness.categories).toHaveLength(0);
        expect(generateTraceabilityHtml(result)).not.toContain('Cross-References');
    });
});
