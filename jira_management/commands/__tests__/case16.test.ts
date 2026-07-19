vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case16 from '../case16.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case16', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case16 — config JSON directory', () => {
        it('exports a handler function', () => {
            expect(case16).toBeDefined();
            expect(typeof case16.handler).toBe('function');
        });

        it('warns and aborts when directory is empty', async () => {
            expect.hasAssertions();

            const { warn } = await import('../../../shared/ui/prompt.js');
            const result = await case16.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Caminho vazio, ignorando.');
            expect(vi.mocked(mockContext.pushHistory)).not.toHaveBeenCalled();
        });

        it('records the JSON directory when a valid path is provided', async () => {
            expect.hasAssertions();

            const { ask, success } = await import('../../../shared/ui/prompt.js');
            vi.mocked(ask).mockResolvedValueOnce('./resultados');
            const result = await case16.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(success)).toHaveBeenCalledWith();
            expect(vi.mocked(mockContext.pushHistory)).toHaveBeenCalledWith(
                'config-json-dir',
                expect.any(String),
                'ok',
            );
        });
    });
});
