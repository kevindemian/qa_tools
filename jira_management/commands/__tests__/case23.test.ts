vi.mock('../../../shared/prompt');
vi.mock('../../../shared/logger');

vi.mock('../../../shared/ai-feedback', () => ({
    getAiFeedbackSummary: vi.fn(),
    getRecentAiRecords: vi.fn(),
}));

vi.mock('../../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

import { warn, tableView, showSelect } from '../../../shared/prompt.js';
import { getAiFeedbackSummary, getRecentAiRecords } from '../../../shared/ai-feedback.js';

const mockGetSummary = vi.mocked(getAiFeedbackSummary);
const mockGetRecent = vi.mocked(getRecentAiRecords);
const mockShowSelect = vi.mocked(showSelect);
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import case23Handler from '../case23.js';

describe('Case23', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockShowSelect.mockResolvedValue('0');
    });

    describe('Case23 — AI Feedback', () => {
        it('shows warning when no feedback records exist', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
            mockGetSummary.mockReturnValue({
                totalRecords: 0,
                totalGenerated: 0,
                totalModified: 0,
                totalDeleted: 0,
                acceptanceRate: 0,
                topPromptVersion: '',
            });

            await case23Handler.handler(makeMockCommandContext());

            expect(warn).toHaveBeenCalledWith('Nenhum registro de feedback de IA encontrado.');
            expect(tableView).not.toHaveBeenCalled();
        });

        it('displays summary when records exist', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
            mockGetSummary.mockReturnValue({
                totalRecords: 5,
                totalGenerated: 20,
                totalModified: 2,
                totalDeleted: 1,
                acceptanceRate: 85,
                topPromptVersion: 'v2',
            });

            await case23Handler.handler(makeMockCommandContext());

            expect(tableView).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ Métrica: 'Total de registros', Valor: 5 })]),
                expect.any(Array),
            );
        });

        it('displays recent records', async () => {
            expect.hasAssertions();

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

            await case23Handler.handler(makeMockCommandContext());

            expect(tableView).toHaveBeenCalledWith(expect.any(Array), expect.arrayContaining(['ID']));
        });

        it('warns when no recent records', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');
            mockGetRecent.mockReturnValue([]);

            await case23Handler.handler(makeMockCommandContext());

            expect(warn).toHaveBeenCalledWith('Nenhum registro recente.');
        });
    });
});
