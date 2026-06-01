jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

jest.mock('../../shared/ai-feedback', () => ({
    getAiFeedbackSummary: jest.fn(),
    getRecentAiRecords: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

import { warn, tableView, showSelect } from '../../shared/prompt';
import { getAiFeedbackSummary, getRecentAiRecords } from '../../shared/ai-feedback';

const mockGetSummary = jest.mocked(getAiFeedbackSummary);
const mockGetRecent = jest.mocked(getRecentAiRecords);
const mockShowSelect = jest.mocked(showSelect);
import { makeMockCommandContext } from '../../shared/test-utils';

beforeEach(() => {
    jest.clearAllMocks();
    mockShowSelect.mockResolvedValue('0');
});

describe('case23 — AI Feedback', () => {
    it('shows warning when no feedback records exist', async () => {
        mockShowSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
        mockGetSummary.mockReturnValue({
            totalRecords: 0,
            totalGenerated: 0,
            totalModified: 0,
            totalDeleted: 0,
            acceptanceRate: 0,
            topPromptVersion: '',
        });

        const mod = require('./case23').default;
        await mod.handler(makeMockCommandContext());

        expect(warn).toHaveBeenCalledWith('Nenhum registro de feedback de IA encontrado.');
        expect(tableView).not.toHaveBeenCalled();
    });

    it('displays summary when records exist', async () => {
        mockShowSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
        mockGetSummary.mockReturnValue({
            totalRecords: 5,
            totalGenerated: 20,
            totalModified: 2,
            totalDeleted: 1,
            acceptanceRate: 85,
            topPromptVersion: 'v2',
        });

        const mod = require('./case23').default;
        await mod.handler(makeMockCommandContext());

        expect(tableView).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ Métrica: 'Total de registros', Valor: 5 })]),
            expect.any(Array),
        );
    });

    it('displays recent records', async () => {
        mockShowSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');
        mockGetRecent.mockReturnValue([
            {
                id: 'rec-1',
                generatedAt: '2026-05-29T00:00:00.000Z',
                promptVersion: 'v2',
                generatedTests: [{ title: 'T1', preConditions: [], stepCount: 1 }],
                userStory: 'As a user',
                acceptanceCriteria: 'some criteria',
                preconditionMatches: [],
            },
        ]);

        const mod = require('./case23').default;
        await mod.handler(makeMockCommandContext());

        expect(tableView).toHaveBeenCalled();
    });

    it('warns when no recent records', async () => {
        mockShowSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');
        mockGetRecent.mockReturnValue([]);

        const mod = require('./case23').default;
        await mod.handler(makeMockCommandContext());

        expect(warn).toHaveBeenCalledWith('Nenhum registro recente.');
    });
});
