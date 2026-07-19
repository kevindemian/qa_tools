vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/jira/jira-helper.js', () => ({
    safeJiraCall: vi.fn(),
}));

import case06 from '../case06.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    checkReleaseTasksStatus: vi.fn().mockResolvedValue(undefined),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case06', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case06 — check release status', () => {
        it('exports a handler function', () => {
            expect(case06).toBeDefined();
            expect(typeof case06.handler).toBe('function');
        });

        it('calls safeJiraCall to check release status', async () => {
            expect.hasAssertions();

            const { ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('v2.8.0');
            const { safeJiraCall } = await import('../../../shared/jira/jira-helper.js');

            const result = await case06.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(safeJiraCall)).toHaveBeenCalledWith(
                mockContext,
                'verificar-status',
                'v2.8.0',
                expect.any(Function),
            );
        });

        it('warns and aborts when version name is empty (no Jira call)', async () => {
            expect.hasAssertions();

            const { ask, warn } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('');
            const { safeJiraCall } = await import('../../../shared/jira/jira-helper.js');

            const result = await case06.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
            expect(vi.mocked(safeJiraCall)).not.toHaveBeenCalled();
            expect(mockJiraResource.checkReleaseTasksStatus).not.toHaveBeenCalled();
        });
    });
});
