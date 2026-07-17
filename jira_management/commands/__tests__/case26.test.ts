/**
 * Tests for case26 — Release Score.
 *
 * Validates handler export, project validation, release score calculation
 * with sufficient/insufficient runs, and history recording.
 *
 * Mock strategy: vi.hoisted for all mocks to avoid unsafe casts.
 */
const {
    mockMetricsRuns,
    mockCalcFlakyEntries,
    mockCalcHealth,
    mockCalcRelease,
    mockGenHtml,
    mockOpen,
    mockWriteReport,
} = vi.hoisted(() => ({
    mockMetricsRuns: vi.fn().mockReturnValue([]),
    mockCalcFlakyEntries: vi.fn().mockReturnValue([]),
    mockCalcHealth: vi.fn<typeof calculateHealthScore>().mockReturnValue({
        overall: 80,
        grade: 'good',
        qualityGate: 'pass',
        dimensions: {
            passRate: { score: 90, status: 'pass' },
            flakyRate: { score: 80, status: 'pass' },
            coverage: { score: 70, status: 'pass' },
            suiteSpeed: { score: 85, status: 'pass' },
            executionRate: { score: 75, status: 'pass' },
        },
        runCount: 5,
        timestamp: new Date().toISOString(),
    }),
    mockCalcRelease: vi.fn().mockReturnValue({ score: 85, label: 'B', details: {} }),
    mockGenHtml: vi.fn().mockReturnValue('<html></html>'),
    mockOpen: vi.fn(),
    mockWriteReport: vi.fn().mockReturnValue('/test/qa-test/release-score.html'),
}));

vi.mock('../../../shared/prompt', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    title: vi.fn(),
    printError: vi.fn(),
}));

vi.mock('../../../shared/logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn().mockReturnValue({
        get computed() {
            return { metricsRuns: mockMetricsRuns() as import('../../../shared/types/data-hub.js').MetricsRun[] };
        },
        raw: {},
    }),
}));

vi.mock('../../../shared/data-hub/compute/flakiness-entries', () => ({
    calcFlakinessEntries: mockCalcFlakyEntries,
}));

vi.mock('../../../shared/config-accessor.js', () => ({
    default: { get: vi.fn().mockReturnValue('TEST') },
}));

vi.mock('../../../shared/health-score', () => ({
    calculateHealthScore: mockCalcHealth,
}));

vi.mock('../../../shared/release-score', () => ({
    calculateReleaseScore: mockCalcRelease,
    generateReleaseScoreHtml: mockGenHtml,
}));

vi.mock('../../../shared/open', () => ({
    openWithFallback: mockOpen,
}));

vi.mock('../../../shared/temp-dir', () => ({
    writeReport: mockWriteReport,
}));

vi.mock('../../../shared/output', () => ({
    defaultOutput: { print: vi.fn() },
}));

import { warn, printError } from '../../../shared/prompt.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import type { calculateHealthScore } from '../../../shared/health-score.js';
import case26 from '../case26.js';

function makeRun(
    overrides?: Partial<{
        project: string;
        timestamp: string;
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
        tests: Array<{ title: string; state: 'passed' | 'failed' | 'skipped'; duration: number }>;
    }>,
) {
    return {
        timestamp: overrides?.timestamp ?? '2026-01-01T00:00:00Z',
        project: overrides?.project ?? 'TEST',
        total: overrides?.total ?? 10,
        passed: overrides?.passed ?? 8,
        failed: overrides?.failed ?? 2,
        skipped: overrides?.skipped ?? 0,
        duration: overrides?.duration ?? 100,
        tests: overrides?.tests ?? [],
    };
}

describe('Case26', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMetricsRuns.mockReturnValue([]);
        mockCalcFlakyEntries.mockReturnValue([]);
        mockCalcHealth.mockReturnValue({
            overall: 80,
            grade: 'good',
            qualityGate: 'pass',
            dimensions: {
                passRate: { score: 90, status: 'pass' },
                flakyRate: { score: 80, status: 'pass' },
                coverage: { score: 70, status: 'pass' },
                suiteSpeed: { score: 85, status: 'pass' },
                executionRate: { score: 75, status: 'pass' },
            },
            runCount: 5,
            timestamp: new Date().toISOString(),
        });
        mockCalcRelease.mockReturnValue({ score: 85, label: 'B', details: {} });
        mockGenHtml.mockReturnValue('<html></html>');
        mockWriteReport.mockReturnValue('/test/qa-test/release-score.html');
    });

    describe('Handler export', () => {
        it('exports a handler function', () => {
            expect(case26).toBeDefined();
            expect(typeof case26.handler).toBe('function');
        });
    });

    describe('Project validation', () => {
        it('warns when no project selected', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ ctx: { project_name: '' } });
            await case26.handler(ctx);

            expect(warn).toHaveBeenCalledWith('Nenhum projeto Jira selecionado.');
        });
    });

    describe('Release score calculation', () => {
        it('calculates release score with sufficient runs', async () => {
            expect.hasAssertions();

            const runs = Array.from({ length: 5 }, () => makeRun({ project: 'TEST' }));
            mockMetricsRuns.mockReturnValue(runs);
            mockCalcFlakyEntries.mockReturnValue([]);

            const ctx = makeMockCommandContext({ projectName: 'TEST' });
            await case26.handler(ctx);

            expect(mockCalcHealth).toHaveBeenCalledTimes(1);

            const healthCallArgs = mockCalcHealth.mock.calls[0];

            expect(healthCallArgs).toBeDefined();

            expect(healthCallArgs?.[0]).toHaveProperty('dataHub');

            expect(healthCallArgs?.[0]?.dataHub).toHaveProperty('computed');

            expect(mockCalcFlakyEntries).toHaveBeenCalledWith(runs, 2);
            expect(mockCalcRelease).toHaveBeenCalledWith(
                80,
                expect.any(Number),
                expect.stringMatching(/^(pass|fail)$/),
                70,
                expect.any(Number),
            );
            expect(mockOpen).toHaveBeenCalledWith(expect.any(String), 'Release Score', expect.any(Function));
        });

        it('calculates release score with insufficient runs (< 2)', async () => {
            expect.hasAssertions();

            const runs = [makeRun({ project: 'TEST' })];
            mockMetricsRuns.mockReturnValue(runs);
            mockCalcFlakyEntries.mockReturnValue([]);

            const ctx = makeMockCommandContext({ projectName: 'TEST' });
            await case26.handler(ctx);

            expect(mockCalcFlakyEntries).toHaveBeenCalledWith([], 2);
            expect(mockCalcRelease).toHaveBeenCalledWith(
                80,
                expect.any(Number),
                expect.stringMatching(/^(pass|fail)$/),
                70,
                expect.any(Number),
            );
        });

        it('records history on success', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ projectName: 'TEST' });
            await case26.handler(ctx);

            expect(ctx.pushHistory).toHaveBeenCalledWith('release-score', 'TEST', 'ok');
        });

        it('calls printError on failure', async () => {
            expect.hasAssertions();

            mockMetricsRuns.mockImplementation(() => {
                throw new Error('store read failed');
            });

            const ctx = makeMockCommandContext({ projectName: 'TEST' });
            await case26.handler(ctx);

            expect(printError).toHaveBeenCalledWith('Erro ao gerar Release Score', expect.any(Error));
        });
    });
});
