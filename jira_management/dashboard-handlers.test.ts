import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from '../shared/test-utils/factories/context-factory.js';

vi.mock('../shared/prompt.js', () => ({
    showSelect: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn((_msg, fn: () => unknown) => fn()),
}));
vi.mock('../shared/metrics.js', () => ({
    loadMetrics: vi.fn(),
    calculateFlakiness: vi.fn(),
}));
vi.mock('../shared/temp-dir.js');
vi.mock('../shared/traceability-matrix.js', () => ({
    buildTraceabilityMatrix: vi.fn(() => []),
    generateTraceabilityHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../shared/health-score.js', () => ({
    calculateHealthScore: vi.fn(() => ({ overall: 80, automationRatio: 0.6, passRate: 0.9 })),
}));
vi.mock('../shared/release-score.js', () => ({
    calculateReleaseScore: vi.fn(() => ({ score: 85 })),
    generateReleaseScoreHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../shared/coverage-gap.js', () => ({
    analyzeCoverageGaps: vi.fn(() => ({ totals: { rawCoveragePct: 75, gap: 5 } })),
}));
vi.mock('../shared/generate-coverage-gap-html.js', () => ({
    generateCoverageGapHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../shared/open.js', () => ({
    openWithFallback: vi.fn(),
}));

describe('case-d — dashboard menu', () => {
    it('returns early if no project name', async () => {
        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: caseD } = await import('./commands/case-d.js');
        const result = await caseD.handler(ctx);
        expect(result).toBeUndefined();
    });

    it('executes selected case26 dashboard handler', async () => {
        const { showSelect } = await import('../shared/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('26' as never);
        const ctx = createMockContext();
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue('/tmp/report.html');
        const { loadMetrics, calculateFlakiness } = await import('../shared/metrics.js');
        vi.mocked(loadMetrics).mockReturnValue({ runs: [{ project: 'TEST' }] } as never);
        vi.mocked(calculateFlakiness).mockReturnValue([{ test: 't1', rate: 0.5 }] as never);
        const { default: caseD } = await import('./commands/case-d.js');
        await caseD.handler(ctx);
        expect(ctx.pushHistory).toHaveBeenCalledWith('release-score', 'TEST', 'ok');
    });

    it('executes selected case27 dashboard handler', async () => {
        const { showSelect } = await import('../shared/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('27' as never);
        const ctx = createMockContext();
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue('/tmp/report.html');
        const { default: caseD } = await import('./commands/case-d.js');
        await caseD.handler(ctx);
        expect(ctx.pushHistory).toHaveBeenCalledWith('coverage-dashboard', '75% coverage, 5 gaps', 'ok');
    });

    it('calls showDashboardMenu when project name is set', async () => {
        const { showSelect } = await import('../shared/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('0' as never);
        const ctx = createMockContext();
        const { default: caseD } = await import('./commands/case-d.js');
        await caseD.handler(ctx);
        expect(showSelect).toHaveBeenCalled();
    });

    it('executes selected dashboard handler', async () => {
        const { showSelect } = await import('../shared/prompt.js');
        vi.mocked(showSelect).mockResolvedValue('25' as never);
        const ctx = createMockContext();
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue('/tmp/report.html');
        const { loadMetrics } = await import('../shared/metrics.js');
        vi.mocked(loadMetrics).mockReturnValue({ runs: [] } as never);
        const { default: caseD } = await import('./commands/case-d.js');
        await caseD.handler(ctx);
        expect(showSelect).toHaveBeenCalled();
        expect(ctx.pushHistory).toHaveBeenCalledWith('traceability-matrix', 'TEST', 'ok');
    });
});

describe('case25 — Traceability Matrix', () => {
    it('generates report and pushes history', async () => {
        const { loadMetrics } = await import('../shared/metrics.js');
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(loadMetrics).mockReturnValue({ runs: [] } as never);
        vi.mocked(writeReport).mockReturnValue('/tmp/report.html');
        const ctx = createMockContext();
        const { default: case25 } = await import('./commands/case25.js');
        await case25.handler(ctx);
        expect(ctx.pushHistory).toHaveBeenCalledWith('traceability-matrix', 'TEST', 'ok');
    });

    it('warns if no project selected', async () => {
        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: case25 } = await import('./commands/case25.js');
        await case25.handler(ctx);
        expect(ctx.pushHistory).not.toHaveBeenCalled();
    });

    it('handles error in loadMetrics gracefully', async () => {
        const { loadMetrics } = await import('../shared/metrics.js');
        vi.mocked(loadMetrics).mockImplementation(() => {
            throw new Error('failed');
        });
        const ctx = createMockContext();
        const { default: case25 } = await import('./commands/case25.js');
        await expect(case25.handler(ctx)).resolves.not.toThrow();
    });
});

describe('case26 — Release Score', () => {
    it('generates report and pushes history', async () => {
        const { loadMetrics, calculateFlakiness } = await import('../shared/metrics.js');
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(loadMetrics).mockReturnValue({ runs: [{ project: 'TEST' }] } as never);
        vi.mocked(calculateFlakiness).mockReturnValue([{ test: 't1', rate: 0.5 }] as never);
        vi.mocked(writeReport).mockReturnValue('/tmp/report.html');
        const ctx = createMockContext();
        const { default: case26 } = await import('./commands/case26.js');
        await case26.handler(ctx);
        expect(ctx.pushHistory).toHaveBeenCalledWith('release-score', 'TEST', 'ok');
    });

    it('warns if no project selected', async () => {
        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: case26 } = await import('./commands/case26.js');
        await case26.handler(ctx);
        expect(ctx.pushHistory).not.toHaveBeenCalled();
    });

    it('handles error in loadMetrics gracefully', async () => {
        const { loadMetrics } = await import('../shared/metrics.js');
        vi.mocked(loadMetrics).mockImplementation(() => {
            throw new Error('failed');
        });
        const ctx = createMockContext();
        const { default: case26 } = await import('./commands/case26.js');
        await expect(case26.handler(ctx)).resolves.not.toThrow();
    });
});

describe('case27 — Coverage Dashboard', () => {
    it('generates report and pushes history', async () => {
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue('/tmp/report.html');
        const ctx = createMockContext();
        const { default: case27 } = await import('./commands/case27.js');
        await case27.handler(ctx);
        expect(ctx.pushHistory).toHaveBeenCalledWith('coverage-dashboard', '75% coverage, 5 gaps', 'ok');
    });

    it('warns if no project selected', async () => {
        const ctx = createMockContext();
        ctx.ctx.project_name = '';
        const { default: case27 } = await import('./commands/case27.js');
        await case27.handler(ctx);
        expect(ctx.pushHistory).not.toHaveBeenCalled();
    });

    it('handles error in analyzeCoverageGaps gracefully', async () => {
        const { analyzeCoverageGaps } = await import('../shared/coverage-gap.js');
        vi.mocked(analyzeCoverageGaps).mockRejectedValue(new Error('API error'));
        const ctx = createMockContext();
        const { default: case27 } = await import('./commands/case27.js');
        const result = await case27.handler(ctx);
        expect(result).toBe(false);
    });

    it('handles openWithFallback error gracefully', async () => {
        const { writeReport } = await import('../shared/temp-dir.js');
        vi.mocked(writeReport).mockReturnValue('/tmp/r.html');
        const { openWithFallback } = await import('../shared/open.js');
        vi.mocked(openWithFallback).mockRejectedValue(new Error('open failed'));
        const ctx = createMockContext();
        const { default: case27 } = await import('./commands/case27.js');
        await expect(case27.handler(ctx)).resolves.not.toThrow();
    });
});
