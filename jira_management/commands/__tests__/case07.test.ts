vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');

import case07 from '../case07.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    getReleaseTasks: vi.fn().mockResolvedValue([]),
    moveCardsToDone: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case07', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case07 — close tasks', () => {
        it('exports a handler function', () => {
            expect(case07).toBeDefined();
            expect(typeof case07.handler).toBe('function');
        });

        it('aborts and returns true when close is not confirmed', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case07.handler(mockContext);

            expect(result).toBeTruthy();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Operação cancelada.');
            expect(mockJiraResource.getReleaseTasks).not.toHaveBeenCalled();
            expect(mockJiraResource.moveCardsToDone).not.toHaveBeenCalled();
        });

        it('closes tasks when confirmed and tasks are found', async () => {
            expect.hasAssertions();

            const { askConfirm, ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(askConfirm).mockResolvedValueOnce(true);
            vi.mocked(ask).mockResolvedValueOnce('Release v2.8.0');
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce([
                '[KEY-1] task one',
                '[KEY-2] task two',
                'no-key line',
            ]);

            const result = await case07.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockJiraResource.moveCardsToDone).toHaveBeenCalledWith(['KEY-1', 'KEY-2']);
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith('fechar-tarefas', '2 tarefa(s)', 'ok');
        });
    });
});
