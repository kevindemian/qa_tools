vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case09 from '../case09.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case09', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case09 — switch project', () => {
        it('exports a handler function', () => {
            expect(case09).toBeDefined();
            expect(typeof case09.handler).toBe('function');
        });

        it('warns and aborts when project name is empty', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case09.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Nome do projeto não pode ser vazio.');
            expect(vi.mocked(mockContext.pushHistory)).not.toHaveBeenCalled();
        });

        it('switches project and persists state when a valid name is provided', async () => {
            expect.hasAssertions();

            const { ask, success } = await import('../../../shared/ui/prompt.js');
            const { update } = await import('../../../shared/state.js');
            vi.mocked(ask).mockResolvedValueOnce('novo-proj');
            const result = await case09.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockContext.ctx.project_name).toBe('NOVO-PROJ');
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith('trocar-projeto', 'NOVO-PROJ', 'ok');
            expect(vi.mocked(update)).toHaveBeenCalledWith(expect.any(Function));
            expect(vi.mocked(success)).toHaveBeenCalledWith('Projeto alterado para: NOVO-PROJ');
        });
    });
});
