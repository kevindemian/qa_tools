import { createMockGitProvider } from '../shared/test-utils/factories';
import { generatePrDescription } from './ai-pr-desc';
import type { GitProvider } from '../shared/types';
import { llmPrompt } from '../shared/llm-client';

jest.mock('../shared/llm-client');

describe('generatePrDescription', () => {
    const mockProvider: GitProvider = createMockGitProvider();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return empty when diff is empty', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('');
        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');
        expect(result).toBe('');
        expect(llmPrompt).not.toHaveBeenCalled();
    });

    it('should call llmPrompt with diff content', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('diff --git a/src/test.ts b/src/test.ts\n+new test');
        jest.mocked(llmPrompt).mockResolvedValue('Resumo: adicionado novo teste.');

        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');
        expect(mockProvider.getDiff).toHaveBeenCalledWith('feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                tier: 'fast',
                callerId: 'pr-description',
            }),
        );
        expect(jest.mocked(llmPrompt).mock.calls[0]![0].user).toEqual(expect.stringContaining('diff --git'));
        expect(result).toBe('Resumo: adicionado novo teste.');
    });

    it('should return empty on llm error', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('some diff');
        jest.mocked(llmPrompt).mockRejectedValue(new Error('API error'));

        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');
        expect(result).toBe('');
    });
});
