vi.mock('../../../shared/ui/prompt.js');

vi.mock('fs', () => ({
    default: { copyFileSync: vi.fn(), existsSync: vi.fn().mockReturnValue(true) },
    copyFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
}));

import case11 from '../case11.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case11', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case11 — generate template', () => {
        it('exports a handler function', () => {
            expect(case11).toBeDefined();
            expect(typeof case11.handler).toBe('function');
        });

        it('rejects an invalid format and returns early', async () => {
            expect.hasAssertions();

            const { error, ask } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('');
            const result = await case11.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(error)).toHaveBeenCalledWith('Formato inválido. Use CSV ou JSON.');
        });

        it('generates the CSV template and records history', async () => {
            expect.hasAssertions();

            const { ask, success } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('CSV').mockResolvedValueOnce('/modelos/out.csv');
            const result = await case11.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(success)).toHaveBeenCalledWith(expect.stringContaining('Template CSV gerado'));
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith(
                'gerar-template',
                expect.stringContaining('CSV'),
                'ok',
            );
        });
    });
});
