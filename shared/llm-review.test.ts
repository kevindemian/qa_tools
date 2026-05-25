jest.mock('./llm-client', () => ({ llmPrompt: jest.fn() }));

import { llmPrompt } from './llm-client';
import { reviewWithLlm } from './llm-review';

const mockLlmPrompt = llmPrompt as jest.MockedFunction<typeof llmPrompt>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('reviewWithLlm', () => {
    it('returns high confidence when reviewer agrees', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce('Primary: root cause is assertion error')
            .mockResolvedValueOnce('AGREE - The analysis is accurate and complete.');

        const result = await reviewWithLlm('', 'system', 'user prompt');

        expect(result.content).toBe('Primary: root cause is assertion error');
        expect(result.reviewed).toBe(true);
        expect(result.confidence).toBe('high');
    });

    it('returns medium confidence with reviewer notes when partial', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce('Primary analysis text')
            .mockResolvedValueOnce('PARTIAL - Missing details on timeout threshold.');

        const result = await reviewWithLlm('', 'system', 'user prompt');

        expect(result.content).toContain('Primary analysis text');
        expect(result.content).toContain('Reviewer notes');
        expect(result.confidence).toBe('medium');
    });

    it('falls back to primary when reviewer fails', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce('Primary fallback content')
            .mockRejectedValueOnce(new Error('Reviewer API error'))
            .mockResolvedValueOnce('Primary fallback content');

        const result = await reviewWithLlm('', 'system', 'user prompt');

        expect(result.content).toBe('Primary fallback content');
        expect(result.reviewed).toBe(false);
        expect(result.confidence).toBe('medium');
    });

    it('throws when both primary and reviewer fail', async () => {
        mockLlmPrompt
            .mockRejectedValueOnce(new Error('Primary error'))
            .mockRejectedValueOnce(new Error('Reviewer error'));

        await expect(reviewWithLlm('', 'system', 'user prompt')).rejects.toThrow();
    });
});
