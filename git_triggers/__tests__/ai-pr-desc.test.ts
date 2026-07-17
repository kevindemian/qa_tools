import { nonNull } from '../../shared/test-utils.js';
import { createMockGitProvider } from '../../shared/test-utils/factories/index.js';
import { generatePrDescription } from '../ai-pr-desc.js';
import type { GitProvider } from '../../shared/types.js';
import { llmPrompt } from '../../shared/llm-client.js';

vi.mock('../../shared/llm-client');

describe('GeneratePrDescription', () => {
    const mockProvider: GitProvider = createMockGitProvider();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('return empty when diff is empty', async () => {
        expect.hasAssertions();

        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('');
        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');

        expect(result).toBe('');
        expect(llmPrompt).not.toHaveBeenCalled();
    });

    it('call llmPrompt with diff content', async () => {
        expect.hasAssertions();

        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('diff --git a/src/test.ts b/src/test.ts\n+new test');
        vi.mocked(llmPrompt).mockResolvedValue('Resumo: adicionado novo teste.');

        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');

        expect(mockProvider.getDiff).toHaveBeenCalledWith('feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                tier: 'fast',
                callerId: 'pr-description',
            }),
        );
        expect(nonNull(vi.mocked(llmPrompt).mock.calls[0])[0].user).toStrictEqual(
            expect.stringContaining('diff --git'),
        );
        expect(result).toBe('Resumo: adicionado novo teste.');
    });

    it('return empty on llm error', async () => {
        expect.hasAssertions();

        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('some diff');
        vi.mocked(llmPrompt).mockRejectedValue(new Error('API error'));

        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');

        expect(result).toBe('');
    });
});
