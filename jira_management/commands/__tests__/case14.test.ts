vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case14 from '../case14.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case14', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case14 — config Cypress directory', () => {
        it('exports a handler function', () => {
            expect(case14).toBeDefined();
            expect(typeof case14.handler).toBe('function');
        });

        it('warns and aborts when directory is empty', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case14.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Caminho vazio, ignorando.');
            expect(vi.mocked(mockContext.pushHistory)).not.toHaveBeenCalled();
        });

        it('persists cypress directory when a valid path is provided', async () => {
            expect.hasAssertions();

            const { ask, success } = await import('../../../shared/ui/prompt.js');
            const { update } = await import('../../../shared/state.js');
            vi.mocked(ask).mockResolvedValueOnce('./testes');
            const result = await case14.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(update)).toHaveBeenCalledWith(expect.any(Function));
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith('config-tests', expect.any(String), 'ok');
            expect(vi.mocked(success)).toHaveBeenCalledWith(
                expect.stringMatching(/Diretório de testes alterado para:.*testes/),
            );
        });
    });
});
