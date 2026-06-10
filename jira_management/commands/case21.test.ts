import { expect } from 'vitest';

vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

vi.mock('../../shared/coverage-gap', () => ({
    analyzeCoverageGaps: vi.fn(),
}));

vi.mock('../../shared/generate-coverage-gap-html', () => ({
    generateCoverageGapHtml: vi.fn().mockReturnValue('<html></html>'),
}));

vi.mock('../../shared/open', () => ({ openWithFallback: vi.fn() }));

vi.mock('../../shared/ai-feedback', () => ({
    recordAiGeneration: vi.fn(),
}));

vi.mock('./case18');

vi.mock('crypto', () => ({
    randomUUID: vi.fn().mockReturnValue('abc-123'),
}));

vi.mock('../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

import * as promptModule from '../../shared/prompt.js';
import * as coverageGapModule from '../../shared/coverage-gap.js';
import * as htmlModule from '../../shared/generate-coverage-gap-html.js';
import * as openModule from '../../shared/open.js';

import type { CoverageGapResult, CoverageGapItem } from '../../shared/types/coverage.js';
import case21Module from './case21.js';
import case18Module from './case18.js';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';

const baseContext = createMockContext();

const mockGapResult: CoverageGapResult = {
    items: [
        {
            issueKey: 'PROJ-1',
            summary: 'Test issue',
            type: 'Story',
            status: 'To Do',
            hasTest: false,
            linkedTestKeys: [],
            priority: 'Medium',
            coverageWeight: 2,
        },
    ],
    totals: { totalIssues: 5, covered: 3, gap: 2, weightedCoveragePct: 60, rawCoveragePct: 60 },
    byEpic: {},
    gateConfig: { minCoveragePct: 50, failingEpics: [] },
    hierarchy: [],
    trends: [],
};

beforeEach(() => {
    vi.clearAllMocks();
});

beforeAll(() => {
    if (!vi.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
});

describe('case21 — Gap Analysis', () => {
    it('displays coverage gap summary', async () => {
        const coverageGap = vi.mocked(coverageGapModule);
        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(mockGapResult);

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(coverageGap.analyzeCoverageGaps).toHaveBeenCalledWith(baseContext.jiraResource, 'TEST');
        expect(baseContext.pushHistory).toHaveBeenCalledWith('coverage-gap-analysis', '60% coverage, 2 gaps', 'ok');
    });

    it('handles error from analyzeCoverageGaps', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);
        coverageGap.analyzeCoverageGaps.mockRejectedValueOnce(new Error('API error'));

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao analisar gaps de cobertura', expect.any(Error));
    });

    it('shows failing epics when quality gate fails', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);
        const resultWithFailures = {
            ...mockGapResult,
            gateConfig: { minCoveragePct: 50, failingEpics: ['EPIC-1'] },
            byEpic: {
                'EPIC-1': {
                    epicSummary: 'My Epic',
                    rawPct: 30,
                    total: 10,
                    covered: 3,
                    weightedPct: 30,
                    gatePass: false,
                    issues: [],
                },
            },
        };
        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(resultWithFailures);

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('abaixo do threshold'));
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('EPIC-1'));
    });

    it('delegates to case18 when user confirms AI gen', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);
        const case18 = vi.mocked(case18Module);

        prompt.askConfirm
            .mockResolvedValueOnce(false) // skip create tests
            .mockResolvedValueOnce(true) // AI gen
            .mockResolvedValueOnce(false); // skip HTML

        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(mockGapResult);
        case18.handler.mockResolvedValueOnce(undefined);

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(case18.handler).toHaveBeenCalledWith(baseContext);
    });

    it('generates HTML report when user confirms', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);
        const case18 = vi.mocked(case18Module);

        prompt.askConfirm
            .mockResolvedValueOnce(false) // skip create tests
            .mockResolvedValueOnce(false) // skip AI gen
            .mockResolvedValueOnce(true); // export HTML

        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(mockGapResult);
        case18.handler.mockResolvedValueOnce(undefined);

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(vi.mocked(htmlModule).generateCoverageGapHtml).toHaveBeenCalled();
        expect(vi.mocked(openModule).openWithFallback).toHaveBeenCalledWith(
            expect.stringContaining('coverage-gap-report.html'),
            'Relatório de cobertura',
            prompt.info,
        );
    });

    it('handles HTML generation error gracefully', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);

        prompt.askConfirm
            .mockResolvedValueOnce(false) // skip create tests
            .mockResolvedValueOnce(false) // skip AI gen
            .mockResolvedValueOnce(true); // export HTML

        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(mockGapResult);
        vi.mocked(htmlModule).generateCoverageGapHtml.mockImplementationOnce(() => {
            throw new Error('Render error');
        });

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao gerar relatório HTML', expect.any(Error));
    });

    it('handles create tests confirmation', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);

        prompt.askConfirm
            .mockResolvedValueOnce(true) // create tests
            .mockResolvedValueOnce(false) // skip AI gen
            .mockResolvedValueOnce(false); // skip HTML

        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(mockGapResult);

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith('Funcionalidade de criação de testes será implementada em breve.');
    });

    it('handles AI gen with more than 5 gaps', async () => {
        const prompt = vi.mocked(promptModule);
        const coverageGap = vi.mocked(coverageGapModule);
        const case18 = vi.mocked(case18Module);

        const gapItems: CoverageGapItem[] = Array.from({ length: 7 }, (_, i) => ({
            issueKey: `PROJ-${i + 1}`,
            summary: `Gap issue ${i + 1}`,
            type: 'Story' as const,
            status: 'To Do',
            hasTest: false,
            linkedTestKeys: [],
            priority: 'Medium',
            coverageWeight: 2,
        }));

        const resultWithManyGaps: CoverageGapResult = {
            ...mockGapResult,
            items: gapItems,
            totals: { ...mockGapResult.totals, totalIssues: 10, covered: 3, gap: 7 },
        };

        prompt.askConfirm
            .mockResolvedValueOnce(false) // skip create tests
            .mockResolvedValueOnce(true) // AI gen
            .mockResolvedValueOnce(false); // skip HTML

        coverageGap.analyzeCoverageGaps.mockResolvedValueOnce(resultWithManyGaps);
        case18.handler.mockResolvedValueOnce(undefined);

        const mod = case21Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('... e mais'));
        expect(case18.handler).toHaveBeenCalledWith(baseContext);
    });
});
