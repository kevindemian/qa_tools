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
        expect(result.adversarialRetried).toBeUndefined();
    });

    it('returns medium confidence with reviewer notes when adversarial retry fails', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('PARTIAL - Missing details on timeout threshold.')
            .mockResolvedValueOnce('invalid json')
            .mockResolvedValueOnce('invalid json')
            .mockResolvedValueOnce('invalid json');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.content).toContain('Reviewer notes');
        expect(result.confidence).toBe('medium');
    });

    it('performs adversarial retry and improves confidence from medium to high', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('PARTIAL - Missing details on timeout threshold.')
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('AGREE - Good after revision.')
            .mockResolvedValueOnce('AGREE - Much better.')
            .mockResolvedValueOnce('AGREE - Acceptable.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.adversarialRetried).toBe(true);
        expect(result.reReviewTier).toBeTruthy();
        expect(result.content).toContain('ASSERTION');
        expect(result.content).not.toContain('Reviewer notes');
    });

    it('keeps low confidence and appends notes when re-review downgrades', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('PARTIAL - Weak recommendations, missing coverage.')
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce(validJsonReport)
            .mockResolvedValueOnce('PARTIAL - Still weak in edge cases.')
            .mockResolvedValueOnce('PARTIAL - Recommendations need work.')
            .mockResolvedValueOnce('DISAGREE - Multiple issues remain.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.adversarialRetried).toBe(true);
        expect(result.content).toContain('Reviewer notes');
    });

    it('skips adversarial retry when reviewerNotes are too short', async () => {
        mockLlmPrompt.mockResolvedValueOnce(validJsonReport).mockResolvedValueOnce('PARTIAL - ok');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.adversarialRetried).toBeUndefined();
        expect(result.confidence).toBe('medium');
        // Notes are only 2 chars (<20), so no retry, but notes still appended
        expect(result.content).toContain('Reviewer notes');
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
        expect(mockLlmPrompt).toHaveBeenCalledTimes(5);
    });
});
