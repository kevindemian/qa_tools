import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';
import type { MetricsRun } from '../../shared/types/data-hub.js';
import type { TraceabilityResult } from '../../shared/report/traceability-matrix.js';
import type { ReleaseScoreResult } from '../../shared/quality/release-score.js';

vi.mock('../../shared/ui/prompt.js', () => ({
    showSelect: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn((_msg: string, fn: () => unknown) => fn()),
}));
vi.mock('../../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn(() => ({
        computed: { metricsRuns: [] },
    })),
}));
vi.mock('../../shared/data-hub/compute/flakiness-entries.js', () => ({
    calcFlakinessEntries: vi.fn().mockReturnValue([]),
}));
vi.mock('../../shared/infra/temp-dir.js', () => ({
    writeReport: vi.fn(),
}));
vi.mock('../../shared/report/traceability-matrix.js', () => ({
    buildTraceabilityMatrix: vi.fn(),
    generateTraceabilityHtml: vi.fn(),
}));
vi.mock('../../shared/quality/health-score.js', () => ({
    calculateHealthScore: vi.fn(),
}));
vi.mock('../../shared/quality/release-score.js', () => ({
    calculateReleaseScore: vi.fn(),
    generateReleaseScoreHtml: vi.fn(),
}));
vi.mock('../../shared/report/coverage-gap.js', () => ({
    analyzeCoverageGaps: vi.fn(),
}));
vi.mock('../../shared/report/generate-coverage-gap-html.js', () => ({
    generateCoverageGapHtml: vi.fn(),
}));
vi.mock('../../shared/open.js', () => ({
    openWithFallback: vi.fn(),
}));

function makeRun(
    project: string,
    overrides?: Partial<{
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
        tests: Array<{ title: string; state: 'passed' | 'failed' | 'skipped'; duration: number }>;
    }>,
) {
    const tests = overrides?.tests ?? [
        { title: 'test-alpha', state: 'passed' as const, duration: 120 },
        { title: 'test-beta', state: 'failed' as const, duration: 340 },
    ];
    return {
        timestamp: '2026-06-14T10:00:00Z',
        project,
        total: overrides?.total ?? tests.length,
        passed: overrides?.passed ?? tests.filter((t) => t.state === 'passed').length,
        failed: overrides?.failed ?? tests.filter((t) => t.state === 'failed').length,
        skipped: overrides?.skipped ?? 0,
        duration: overrides?.duration ?? tests.reduce((s, t) => s + t.duration, 0),
        tests,
    };
}

function makeTraceabilityResult(overrides?: Partial<TraceabilityResult>): TraceabilityResult {
    return {
        nodes: [{ epic: 'EPIC-1', coverage: 85, health: 90, flakiness: 5, stories: [] }],
        totalEpics: 1,
        totalTests: 10,
        overallCoverage: 85,
        timestamp: '2026-06-14T10:00:00Z',
        awareness: { categories: [], minConfidence: null },
        ...overrides,
    };
}

const MOCK_DIMENSIONS = {
    passRate: { score: 90, threshold: 80, status: 'pass' as const, available: true },
    flakyRate: { score: 95, threshold: 80, status: 'pass' as const, available: true },
    coverage: { score: 85, threshold: 70, status: 'pass' as const, available: true },
    suiteSpeed: { score: 80, threshold: 70, status: 'pass' as const, available: true },
    executionRate: { score: 90, threshold: 80, status: 'pass' as const, available: true },
};

function makeReleaseScoreResult(overrides?: Partial<ReleaseScoreResult>): ReleaseScoreResult {
    return {
        score: 82,
        grade: 'good',
        breakdown: [
            { label: 'Tasks', score: 80, status: 'pass' },
            { label: 'Health', score: 85, status: 'pass' },
            { label: 'Coverage', score: 75, status: 'pass' },
            { label: 'Flakiness', score: 90, status: 'pass' },
        ],
        recommendation: 'All dimensions meet the release threshold. Ready for release.',
        timestamp: '2026-06-14T10:00:00Z',
        ...overrides,
    };
}

function makeCoverageResult() {
    return {
        items: [
            {
                issueKey: 'TEST-1',
                summary: 'Test 1',
                type: 'Story' as const,
                status: 'Done',
                epicKey: 'EPIC-1',
                hasTest: true,
                linkedTestKeys: ['TEST-100'],
                priority: 'High',
                coverageWeight: 1,
            },
            {
                issueKey: 'TEST-2',
                summary: 'Test 2',
                type: 'Task' as const,
                status: 'To Do',
                epicKey: 'EPIC-1',
                hasTest: false,
                linkedTestKeys: [],
                priority: 'Medium',
                coverageWeight: 1,
            },
        ],
        totals: { totalIssues: 10, covered: 8, gap: 2, weightedCoveragePct: 80, rawCoveragePct: 75 },
        byEpic: {
            'EPIC-1': {
                epicSummary: 'Epic 1',
                total: 10,
                covered: 8,
                weightedPct: 80,
                rawPct: 80,
                gatePass: true,
                issues: [],
            },
        },
        gateConfig: { minCoveragePct: 70, failingEpics: [] },
        hierarchy: [],
        trends: [],
    };
}

const HTML_WITH_DOCTYPE = '<!DOCTYPE html><html><head><title>Test</title></head><body>content</body></html>';

describe('Case-d — dashboard menu', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns early if no project name', async () => {
        expect.hasAssertions();

        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: caseD } = await import('../commands/case-d.js');
        const result = await caseD.handler(ctx);

        expect(result).toBeUndefined();
    });

    it('shows dashboard menu when project is set', async () => {
        expect.hasAssertions();

        const { showSelect } = await import('../../shared/ui/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('0');
        const ctx = createMockContext();
        const { default: caseD } = await import('../commands/case-d.js');
        await caseD.handler(ctx);

        expect(showSelect).toHaveBeenCalledTimes(1);
    });

    it('executes case25 when user selects traceability', async () => {
        expect.hasAssertions();

        const { showSelect } = await import('../../shared/ui/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('25');
        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: [] },
        } as never);
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: caseD } = await import('../commands/case-d.js');
        await caseD.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('traceability-matrix', 'TEST', 'ok');
    });

    it('executes case26 when user selects release score', async () => {
        expect.hasAssertions();

        const { showSelect } = await import('../../shared/ui/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('26');
        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        const { calcFlakinessEntries } = await import('../../shared/data-hub/compute/flakiness-entries.js');
        const { calculateHealthScore } = await import('../../shared/quality/health-score.js');
        const { calculateReleaseScore, generateReleaseScoreHtml } =
            await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: [{ project: 'TEST' }] },
        } as never);
        vi.mocked(calcFlakinessEntries).mockReturnValue([
            { title: 't1', project: 'TEST', passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2, rate: 0.5 },
        ]);
        vi.mocked(calculateHealthScore).mockReturnValue({
            overall: 80,
            grade: 'good',
            qualityGate: 'pass',
            dimensions: MOCK_DIMENSIONS,
            runCount: 10,
            timestamp: '2026-06-14T10:00:00Z',
        });
        vi.mocked(calculateReleaseScore).mockReturnValue(makeReleaseScoreResult());
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: caseD } = await import('../commands/case-d.js');
        await caseD.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('release-score', 'TEST', 'ok');
    });

    it('executes case27 when user selects coverage dashboard', async () => {
        expect.hasAssertions();

        const { showSelect } = await import('../../shared/ui/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('27');
        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: caseD } = await import('../commands/case-d.js');
        await caseD.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('coverage-dashboard', '75% coverage, 2 gaps', 'ok');
    });
});

describe('Case25 — Traceability Matrix', () => {
    beforeEach(() => vi.clearAllMocks());

    it('warns and returns early if no project name', async () => {
        expect.hasAssertions();

        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);

        expect(ctx.pushHistory).not.toHaveBeenCalled();

        const { warn } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(warn)).toHaveBeenCalledWith('Nenhum projeto Jira selecionado.');
    });

    it('loads metrics from store', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        const { buildTraceabilityMatrix, generateTraceabilityHtml } =
            await import('../../shared/report/traceability-matrix.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        const runs = [makeRun('TEST')];
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: runs },
        } as never);
        vi.mocked(buildTraceabilityMatrix).mockReturnValue(makeTraceabilityResult());
        vi.mocked(generateTraceabilityHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-traceability-matrix-TEST.html'));
        const ctx = createMockContext();
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);

        expect(getDataHub).toHaveBeenCalledWith();
        expect(buildTraceabilityMatrix).toHaveBeenCalledWith(runs, undefined, expect.anything());
    });

    it('generates HTML with project name in title', async () => {
        expect.hasAssertions();

        const { buildTraceabilityMatrix, generateTraceabilityHtml } =
            await import('../../shared/report/traceability-matrix.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(buildTraceabilityMatrix).mockReturnValue(makeTraceabilityResult());
        vi.mocked(generateTraceabilityHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'MY_PROJECT';
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);

        expect(generateTraceabilityHtml).toHaveBeenCalledWith(expect.anything(), 'Traceability Matrix — MY_PROJECT');
    });

    it('writes report with correct filename pattern', async () => {
        expect.hasAssertions();

        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'PROJ-XYZ';
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);

        expect(writeReport).toHaveBeenCalledWith('traceability-matrix-PROJ-XYZ.html', HTML_WITH_DOCTYPE);
    });

    it('opens report in browser', async () => {
        expect.hasAssertions();

        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        const { openWithFallback } = await import('../../shared/open.js');
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-traceability-matrix-TEST.html'));
        vi.mocked(openWithFallback).mockResolvedValue(undefined);
        const ctx = createMockContext();
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);

        expect(openWithFallback).toHaveBeenCalledWith(
            path.join(os.tmpdir(), 'qa-traceability-matrix-TEST.html'),
            'Traceability Matrix',
            expect.any(Function),
        );
    });

    it('pushes history with project name on success', async () => {
        expect.hasAssertions();

        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'AUDIT-PROJ';
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('traceability-matrix', 'AUDIT-PROJ', 'ok');
    });

    it('handles empty metrics store gracefully', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        const { buildTraceabilityMatrix } = await import('../../shared/report/traceability-matrix.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: [] },
        } as never);
        vi.mocked(buildTraceabilityMatrix).mockReturnValue(
            makeTraceabilityResult({ nodes: [], totalEpics: 0, totalTests: 0, overallCoverage: 0 }),
        );
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case25 } = await import('../commands/case25.js');

        await expect(case25.handler(ctx)).resolves.not.toThrow();
        expect(ctx.pushHistory).toHaveBeenCalledWith('traceability-matrix', 'TEST', 'ok');
    });

    it('handles loadMetrics error gracefully', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        vi.mocked(getDataHub).mockImplementation(() => {
            throw new Error('disk error');
        });
        const ctx = createMockContext();
        const { default: case25 } = await import('../commands/case25.js');

        await expect(case25.handler(ctx)).resolves.not.toThrow();

        const { printError } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(printError)).toHaveBeenCalledTimes(1);
    });

    it('calls title with correct label', async () => {
        expect.hasAssertions();

        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case25 } = await import('../commands/case25.js');
        await case25.handler(ctx);
        const { title } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(title)).toHaveBeenCalledWith('Traceability Matrix');
    });
});

describe('Case26 — Release Score', () => {
    beforeEach(() => vi.clearAllMocks());

    it('warns and returns early if no project name', async () => {
        expect.hasAssertions();

        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(ctx.pushHistory).not.toHaveBeenCalled();
    });

    it('filters runs by project name', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        const { calcFlakinessEntries } = await import('../../shared/data-hub/compute/flakiness-entries.js');
        const { calculateHealthScore } = await import('../../shared/quality/health-score.js');
        const { calculateReleaseScore, generateReleaseScoreHtml } =
            await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        const allRuns = [makeRun('OTHER'), makeRun('TEST'), makeRun('OTHER'), makeRun('TEST')];
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: allRuns },
        } as never);
        vi.mocked(calculateHealthScore).mockReturnValue({
            overall: 80,
            grade: 'good',
            qualityGate: 'pass',
            dimensions: MOCK_DIMENSIONS,
            runCount: 10,
            timestamp: '2026-06-14T10:00:00Z',
        });
        vi.mocked(calcFlakinessEntries).mockReturnValue([]);
        vi.mocked(calculateReleaseScore).mockReturnValue(makeReleaseScoreResult());
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);
        const receivedRuns = vi.mocked(calcFlakinessEntries).mock.calls[0]?.[0] as MetricsRun[];

        expect(receivedRuns).toHaveLength(2);
        expect(receivedRuns[0]?.project).toBe('TEST');
        expect(receivedRuns[1]?.project).toBe('TEST');
    });

    it('passes correct parameters to calculateReleaseScore', async () => {
        expect.hasAssertions();

        const { calculateHealthScore } = await import('../../shared/quality/health-score.js');
        const { calculateReleaseScore, generateReleaseScoreHtml } =
            await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(calculateHealthScore).mockReturnValue({
            overall: 85,
            grade: 'good',
            qualityGate: 'pass',
            dimensions: MOCK_DIMENSIONS,
            runCount: 10,
            timestamp: '2026-06-14T10:00:00Z',
        });
        vi.mocked(calculateReleaseScore).mockReturnValue(makeReleaseScoreResult());
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(calculateReleaseScore).toHaveBeenCalledWith(undefined, 85, 'pass', undefined, expect.any(Number));
    });

    it('generates HTML with correct title', async () => {
        expect.hasAssertions();

        const { generateReleaseScoreHtml } = await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);
        const receivedData = vi.mocked(generateReleaseScoreHtml).mock.calls[0]?.[0] as { score: number; grade: string };

        expect(typeof receivedData.score).toBe('number');
        expect(typeof receivedData.grade).toBe('string');
    });

    it('writes report with correct filename pattern', async () => {
        expect.hasAssertions();

        const { generateReleaseScoreHtml } = await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'RELEASE-PROJ';
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(writeReport).toHaveBeenCalledWith('release-score-RELEASE-PROJ.html', HTML_WITH_DOCTYPE);
    });

    it('opens report in browser', async () => {
        expect.hasAssertions();

        const { generateReleaseScoreHtml } = await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        const { openWithFallback } = await import('../../shared/open.js');
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-release-score-TEST.html'));
        vi.mocked(openWithFallback).mockResolvedValue(undefined);
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(openWithFallback).toHaveBeenCalledWith(
            path.join(os.tmpdir(), 'qa-release-score-TEST.html'),
            'Release Score',
            expect.any(Function),
        );
    });

    it('pushes history with project name on success', async () => {
        expect.hasAssertions();

        const { generateReleaseScoreHtml } = await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'QA-PROJECT';
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('release-score', 'QA-PROJECT', 'ok');
    });

    it('handles loadMetrics error gracefully', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        vi.mocked(getDataHub).mockImplementation(() => {
            throw new Error('IO error');
        });
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');

        await expect(case26.handler(ctx)).resolves.not.toThrow();

        const { printError } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(printError)).toHaveBeenCalledTimes(1);
    });

    it('calls title with correct label', async () => {
        expect.hasAssertions();

        const { generateReleaseScoreHtml } = await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);
        const { title } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(title)).toHaveBeenCalledWith('Release Score');
    });

    it('uses health gate pass when health >= 70', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        const { calcFlakinessEntries } = await import('../../shared/data-hub/compute/flakiness-entries.js');
        const { calculateHealthScore } = await import('../../shared/quality/health-score.js');
        const { calculateReleaseScore, generateReleaseScoreHtml } =
            await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: [makeRun('TEST')] },
        } as never);
        vi.mocked(calcFlakinessEntries).mockReturnValue([]);
        vi.mocked(calculateHealthScore).mockReturnValue({
            overall: 75,
            grade: 'good',
            qualityGate: 'pass',
            dimensions: MOCK_DIMENSIONS,
            runCount: 10,
            timestamp: '2026-06-14T10:00:00Z',
        });
        vi.mocked(calculateReleaseScore).mockReturnValue(makeReleaseScoreResult());
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(calculateReleaseScore).toHaveBeenCalledWith(undefined, 75, 'pass', undefined, expect.any(Number));
    });

    it('uses health gate fail when health < 70', async () => {
        expect.hasAssertions();

        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        const { calcFlakinessEntries } = await import('../../shared/data-hub/compute/flakiness-entries.js');
        const { calculateHealthScore } = await import('../../shared/quality/health-score.js');
        const { calculateReleaseScore, generateReleaseScoreHtml } =
            await import('../../shared/quality/release-score.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(getDataHub).mockReturnValue({
            computed: { metricsRuns: [makeRun('TEST')] },
        } as never);
        vi.mocked(calcFlakinessEntries).mockReturnValue([]);
        vi.mocked(calculateHealthScore).mockReturnValue({
            overall: 55,
            grade: 'needs_attention',
            qualityGate: 'fail',
            dimensions: MOCK_DIMENSIONS,
            runCount: 10,
            timestamp: '2026-06-14T10:00:00Z',
        });
        vi.mocked(calculateReleaseScore).mockReturnValue(makeReleaseScoreResult({ grade: 'needs_attention' }));
        vi.mocked(generateReleaseScoreHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case26 } = await import('../commands/case26.js');
        await case26.handler(ctx);

        expect(calculateReleaseScore).toHaveBeenCalledWith(undefined, 55, 'fail', undefined, expect.any(Number));
    });
});

describe('Case27 — Coverage Dashboard', () => {
    beforeEach(() => vi.clearAllMocks());

    it('warns and returns early if no project name', async () => {
        expect.hasAssertions();

        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(ctx.pushHistory).not.toHaveBeenCalled();
    });

    it('calls analyzeCoverageGaps with jiraResource and project name', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(analyzeCoverageGaps).toHaveBeenCalledWith(ctx.jiraResource, 'TEST');
    });

    it('generates HTML with project name in title', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'COV-PROJ';
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(generateCoverageGapHtml).toHaveBeenCalledWith(expect.anything(), 'Coverage Dashboard — COV-PROJ');
    });

    it('writes report with correct filename pattern', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        ctx.ctx.project_name = 'DASH-XYZ';
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(writeReport).toHaveBeenCalledWith('coverage-dashboard-DASH-XYZ.html', HTML_WITH_DOCTYPE);
    });

    it('opens report in browser', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        const { openWithFallback } = await import('../../shared/open.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-coverage-dashboard-TEST.html'));
        vi.mocked(openWithFallback).mockResolvedValue(undefined);
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(openWithFallback).toHaveBeenCalledWith(
            path.join(os.tmpdir(), 'qa-coverage-dashboard-TEST.html'),
            'Coverage Dashboard',
            expect.any(Function),
        );
    });

    it('pushes history with coverage summary on success', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('coverage-dashboard', '75% coverage, 2 gaps', 'ok');
    });

    it('returns false when analysis fails', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        vi.mocked(analyzeCoverageGaps).mockRejectedValue(new Error('Jira API down'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        const result = await case27.handler(ctx);

        expect(result).toBeFalsy();

        const { printError } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(printError)).toHaveBeenCalledTimes(1);
    });

    it('does not call writeReport when analysis fails', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockRejectedValue(new Error('timeout'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);

        expect(writeReport).not.toHaveBeenCalled();
    });

    it('handles openWithFallback error gracefully', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        const { openWithFallback } = await import('../../shared/open.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-r.html'));
        vi.mocked(openWithFallback).mockRejectedValue(new Error('no browser'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');

        await expect(case27.handler(ctx)).resolves.not.toThrow();
    });

    it('calls title with correct label', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);
        const { title } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(title)).toHaveBeenCalledWith('Coverage Dashboard');
    });

    it('uses withSpinner during analysis', async () => {
        expect.hasAssertions();

        const { analyzeCoverageGaps } = await import('../../shared/report/coverage-gap.js');
        const { generateCoverageGapHtml } = await import('../../shared/report/generate-coverage-gap-html.js');
        const { writeReport } = await import('../../shared/infra/temp-dir.js');
        vi.mocked(analyzeCoverageGaps).mockResolvedValue(makeCoverageResult());
        vi.mocked(generateCoverageGapHtml).mockReturnValue(HTML_WITH_DOCTYPE);
        vi.mocked(writeReport).mockReturnValue(path.join(os.tmpdir(), 'qa-test-report.html'));
        const ctx = createMockContext();
        const { default: case27 } = await import('../commands/case27.js');
        await case27.handler(ctx);
        const { withSpinner } = await import('../../shared/ui/prompt.js');

        expect(vi.mocked(withSpinner)).toHaveBeenCalledWith('Analisando cobertura...', expect.any(Function));
    });
});
