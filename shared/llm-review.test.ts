jest.mock('./llm-client', () => ({
    llmPrompt: jest.fn(),
    getLlmClientMetrics: jest.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: jest.fn(),
    parseRetryAfter: jest.fn(() => 2000),
}));

import { llmPrompt } from './llm-client';
import { reviewWithLlm } from './llm-review';

const mockLlmPrompt = llmPrompt as jest.MockedFunction<typeof llmPrompt>;

const validJsonReport = JSON.stringify({
    tests: [
        {
            title: 'Login fails',
            classification: 'ASSERTION',
            severity: 'high',
            recommendation: 'Fix the assertion logic in the login component.',
        },
    ],
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('reviewWithLlm', () => {
    it('returns high confidence when reviewer agrees', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('AGREE - The analysis is accurate and complete.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBe(true);
        expect(result.confidence).toBe('high');
    });

    it('returns medium confidence with reviewer notes when partial', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('PARTIAL - Missing details on timeout threshold.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.content).toContain('Reviewer notes');
        expect(result.confidence).toBe('medium');
    });

    it('retries when validation fails and eventually succeeds', async () => {
        const invalidJson = JSON.stringify({ tests: [{ title: 'Login fails' }] });
        mockLlmPrompt
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('AGREE - Good.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBe(true);
        expect(mockLlmPrompt).toHaveBeenCalledTimes(3);
    });

    it('falls back to main when report returns non-JSON', async () => {
        mockLlmPrompt.mockResolvedValueOnce('plain text analysis').mockResolvedValueOnce('fallback content');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toBe('fallback content');
        expect(result.reviewed).toBe(false);
        expect(result.confidence).toBe('medium');
        expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to main when all retries fail validation', async () => {
        const invalidJson = JSON.stringify({ tests: [{ title: 'Bad' }] });
        mockLlmPrompt
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce('fallback content');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toBe('fallback content');
        expect(result.reviewed).toBe(false);
        expect(result.fallbackUsed).toBe(true);
        // 1 primary + 3 retries + 1 fallback = 5
        expect(mockLlmPrompt).toHaveBeenCalledTimes(5);
    });

    it('buildRetryPrompt includes validation errors and invalid response', async () => {
        const invalidJson = JSON.stringify({ tests: [{ title: 'Bad' }] });
        mockLlmPrompt
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(
                JSON.stringify({
                    tests: [
                        {
                            title: 'Fixed',
                            classification: 'ASSERTION',
                            severity: 'high',
                            recommendation: 'Long enough recommendation text',
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce('AGREE - Good.');

        await reviewWithLlm('system prompt text', 'user data');
        // Second call is the retry — the system arg (index 1) contains buildRetryPrompt output
        const retrySystemArg = mockLlmPrompt.mock.calls[1]![1];
        expect(retrySystemArg).toContain('validation');
        expect(retrySystemArg).toContain(invalidJson);
    });

    it('returns fallback when report is non-JSON and main fails', async () => {
        mockLlmPrompt.mockResolvedValueOnce('text').mockRejectedValueOnce(new Error('Main API error'));

        const result = await reviewWithLlm('system prompt', 'user prompt');
        expect(result.confidence).toBe('medium');
        expect(result.fallbackUsed).toBe(true);
        expect(result.reviewed).toBe(false);
    });

    it('exhausts MAX_RETRIES=3 before falling back', async () => {
        const invalidJson = JSON.stringify({ tests: [{ title: 'Bad' }] });
        mockLlmPrompt
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce(invalidJson)
            .mockResolvedValueOnce('fallback after retries');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.fallbackUsed).toBe(true);
        // 1 primary attempt + 3 retries (MAX_RETRIES=3) + 1 fallback = 5
        expect(mockLlmPrompt).toHaveBeenCalledTimes(5);
    });
});
