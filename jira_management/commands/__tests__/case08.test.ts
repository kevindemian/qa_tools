vi.mock('../../../shared/ui/prompt.js');

import case08 from '../case08.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    releaseVersion: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case08', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case08 — release version', () => {
        it('exports a handler function', () => {
            expect(case08).toBeDefined();
            expect(typeof case08.handler).toBe('function');
        });

        it('aborts and returns true when release is not confirmed', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case08.handler(mockContext);

            expect(result).toBeTruthy();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Operação cancelada.');
            expect(mockJiraResource.releaseVersion).not.toHaveBeenCalled();
            expect(vi.mocked(mockContext.pushHistory)).not.toHaveBeenCalledWith(
                'publicar-versão',
                expect.any(String),
                'ok',
            );
        });

        it('releases the version when confirmed', async () => {
            expect.hasAssertions();

            const { askConfirm, ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(askConfirm).mockResolvedValueOnce(true);
            vi.mocked(ask).mockResolvedValueOnce('v2.8.0');

            const result = await case08.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockJiraResource.releaseVersion).toHaveBeenCalledWith(mockContext.ctx.project_name, 'v2.8.0');
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith('publicar-versão', 'v2.8.0', 'ok');
        });
    });
});
