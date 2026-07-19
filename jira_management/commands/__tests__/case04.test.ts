vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');

import case04 from '../case04.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    updateFixVersions: vi.fn().mockResolvedValue({}),
    postJiraResource: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case04', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case04 — assign fixVersion', () => {
        it('exports a handler function', () => {
            expect(case04).toBeDefined();
            expect(typeof case04.handler).toBe('function');
        });

        it('aborts and returns true when assignment is not confirmed', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case04.handler(mockContext);

            expect(result).toBeTruthy();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Operação cancelada.');
            expect(mockJiraResource.updateFixVersions).not.toHaveBeenCalled();
            expect(vi.mocked(mockContext.pushHistory)).not.toHaveBeenCalledWith(
                'atribuir-fixversion',
                expect.any(String),
                expect.any(String),
            );
        });

        it('assigns fixVersion when confirmed with in-memory tasks', async () => {
            expect.hasAssertions();

            const { askConfirm, ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(askConfirm).mockImplementation((msg: string) => Promise.resolve(msg.startsWith('Confirmar')));
            vi.mocked(ask).mockResolvedValueOnce('KEY-1 KEY-2').mockResolvedValueOnce('v2.8.0');
            mockContext.ctx.inMemoryTasksId = ['KEY-1', 'KEY-2'];

            const result = await case04.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockJiraResource.updateFixVersions).toHaveBeenCalledWith(
                ['KEY-1'],
                mockContext.ctx.project_name,
                'v2.8.0',
            );
            expect(mockJiraResource.updateFixVersions).toHaveBeenCalledWith(
                ['KEY-2'],
                mockContext.ctx.project_name,
                'v2.8.0',
            );
            expect(mockJiraResource.updateFixVersions).toHaveBeenCalledTimes(2);
        });
    });
});
