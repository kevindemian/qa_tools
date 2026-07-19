vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/jira/jira-helper.js', () => ({
    safeJiraCall: vi.fn(),
}));

import case03 from '../case03.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    getProjectId: vi.fn().mockResolvedValue('123'),
    createVersion: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case03', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case03 — create version', () => {
        it('exports a handler function', () => {
            expect(case03).toBeDefined();
            expect(typeof case03.handler).toBe('function');
        });

        it('warns and aborts when version name is empty', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case03.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
            expect(mockJiraResource.createVersion).not.toHaveBeenCalled();
        });

        it('creates the version when a valid name is provided', async () => {
            expect.hasAssertions();

            const { ask, askMultiline } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('v2.8.0');
            vi.mocked(askMultiline).mockResolvedValueOnce('release description');
            const { safeJiraCall } = await import('../../../shared/jira/jira-helper.js');

            const result = await case03.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(safeJiraCall)).toHaveBeenCalledWith(
                mockContext,
                'criar-versão',
                'v2.8.0',
                expect.any(Function),
            );
        });
    });
});
