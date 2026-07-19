vi.mock('../../../shared/ui/prompt.js');

vi.mock('../test-execution-flow', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

import case13 from '../case13.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case13', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case13 — create test execution', () => {
        it('exports a handler function', () => {
            expect(case13).toBeDefined();
            expect(typeof case13.handler).toBe('function');
        });

        it('warns and aborts when no keys are provided', async () => {
            expect.hasAssertions();

            const { warn, ask } = await import('../../../shared/ui/prompt.js');
            const { offerTestExecutionAssociation, showResults } = await import('../test-execution-flow.js');
            vi.mocked(ask).mockResolvedValueOnce('');
            const result = await case13.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(warn)).toHaveBeenCalledWith('Nenhuma key informada.');
            expect(vi.mocked(offerTestExecutionAssociation)).not.toHaveBeenCalled();
            expect(vi.mocked(showResults)).not.toHaveBeenCalled();
        });

        it('associates and shows results when keys are provided', async () => {
            expect.hasAssertions();

            const { ask } = await import('../../../shared/ui/prompt.js');
            const { offerTestExecutionAssociation, showResults } = await import('../test-execution-flow.js');
            vi.mocked(ask).mockResolvedValueOnce('TEST-1 TEST-2');
            const result = await case13.handler(mockContext);

            expect(result).toBeUndefined();
            expect(vi.mocked(offerTestExecutionAssociation)).toHaveBeenCalledWith(
                mockContext,
                ['TEST-1', 'TEST-2'],
                'standalone',
            );
            expect(vi.mocked(showResults)).toHaveBeenCalledWith(mockContext, ['TEST-1', 'TEST-2'], expect.anything());
        });
    });
});
