vi.mock('../../../shared/ui/prompt.js');

import case10 from '../case10.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext({
    ctx: {
        createPackageManager: vi.fn().mockReturnValue({ updateReleaseNotes: vi.fn(), updateVersion: vi.fn() }),
    },
});

describe('Case10', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case10 — set directory', () => {
        it('exports a handler function', () => {
            expect(case10).toBeDefined();
            expect(typeof case10.handler).toBe('function');
        });

        it('sets the git directory and creates the package manager', async () => {
            expect.hasAssertions();

            const { success } = await import('../../../shared/ui/prompt.js');
            const { ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('/repo');
            const result = await case10.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockContext.ctx.git_directory).toBe('/repo');
            expect(mockContext.ctx.createPackageManager).toHaveBeenCalledWith('/repo');
            expect(vi.mocked(success)).toHaveBeenCalledWith('Diretório alterado para: /repo');
        });

        it('warns and aborts when directory path is empty (no state change)', async () => {
            expect.hasAssertions();

            const { ask, warn, success } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('');
            const dirBefore = mockContext.ctx.git_directory;

            const result = await case10.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Caminho do diretório não pode ser vazio.');
            expect(vi.mocked(success)).not.toHaveBeenCalled();
            expect(mockContext.ctx.git_directory).toBe(dirBefore);
            expect(mockContext.ctx.createPackageManager).not.toHaveBeenCalled();
        });
    });
});
