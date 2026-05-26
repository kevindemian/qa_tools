import { generatePrDescription } from './ai-pr-desc';
import type { GitProvider } from '../shared/types';
import { llmPrompt } from '../shared/llm-client';

jest.mock('../shared/llm-client');

describe('generatePrDescription', () => {
    const mockProvider: GitProvider = {
        getDiff: jest.fn(),
    } as unknown as GitProvider;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return empty when diff is empty', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('');
        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');
        expect(result).toBe('');
        expect(llmPrompt).not.toHaveBeenCalled();
    });

    it('should call llmPrompt with diff content', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('diff --git a/src/test.ts b/src/test.ts\n+new test');
        (llmPrompt as jest.Mock).mockResolvedValue('Resumo: adicionado novo teste.');

        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');
        expect(mockProvider.getDiff).toHaveBeenCalledWith('feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalledWith(
            'fast',
            expect.any(String),
            expect.stringContaining('diff --git'),
            'pr-description',
        );
        expect(result).toBe('Resumo: adicionado novo teste.');
    });

    it('should return empty on llm error', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('some diff');
        (llmPrompt as jest.Mock).mockRejectedValue(new Error('API error'));

        const result = await generatePrDescription(mockProvider, 'feature/a', 'main');
        expect(result).toBe('');
    });
});
