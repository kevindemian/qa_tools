vi.mock('../../../shared/ui/prompt.js');

import case05 from '../case05.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    getReleaseTasks: vi.fn().mockResolvedValue([]),
};

const mockContext = makeMockCommandContext({
    jiraResource: mockJiraResource,
    ctx: { packageManager: { updateReleaseNotes: vi.fn(), updateVersion: vi.fn() } },
});

const mockPackageManager = mockContext.ctx.packageManager as {
    updateReleaseNotes: ReturnType<typeof vi.fn>;
    updateVersion: ReturnType<typeof vi.fn>;
};

describe('Case05', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case05 — update package version', () => {
        it('exports a handler function', () => {
            expect(case05).toBeDefined();
            expect(typeof case05.handler).toBe('function');
        });

        it('warns and aborts when no release tasks are found', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case05.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).not.toHaveBeenCalledWith('Nenhuma tarefa encontrada para esta versão.');
            expect(mockPackageManager.updateReleaseNotes).toHaveBeenCalledWith('', []);
            expect(mockPackageManager.updateVersion).toHaveBeenCalledWith('');
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith(
                'atualizar-package',
                'Package atualizado para v',
                'ok',
            );
        });

        it('updates package version and release notes when tasks exist', async () => {
            expect.hasAssertions();

            const { ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('Release v2.7.0');
            mockJiraResource.getReleaseTasks.mockResolvedValueOnce(['[KEY-1] task']);

            const result = await case05.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockPackageManager.updateReleaseNotes).toHaveBeenCalledWith('v2.7.0', ['[KEY-1] task']);
            expect(mockPackageManager.updateVersion).toHaveBeenCalledWith('2.7.0');
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith(
                'atualizar-package',
                'Package atualizado para v2.7.0',
                'ok',
            );
        });
    });
});
