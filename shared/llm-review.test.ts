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
import { nonNull } from './test-utils';

const mockLlmPrompt = jest.mocked(llmPrompt);

const validParsedReport = {
    tests: [
        {
            title: 'Login fails',
            classification: 'ASSERTION' as const,
            severity: 'high' as const,
            recommendation: 'Fix the assertion logic in the login component.',
        },
    ],
};

const invalidParsedReport = { tests: [{ title: 'Bad' }] };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('reviewWithLlm', () => {
    it('returns high confidence when reviewer agrees', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('AGREE - The analysis is accurate and complete.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBe(true);
        expect(result.confidence).toBe('high');
        expect(result.adversarialRetried).toBeUndefined();
    });

    it('returns medium confidence with reviewer notes when adversarial retry fails', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('PARTIAL - Missing details on timeout threshold.')
            .mockRejectedValueOnce(new Error('adversarial retry failed'))
            .mockRejectedValueOnce(new Error('adversarial retry failed'))
            .mockRejectedValueOnce(new Error('adversarial retry failed'));

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.content).toContain('Reviewer notes');
        expect(result.confidence).toBe('medium');
    });

    it('performs adversarial retry and improves confidence from medium to high', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('PARTIAL - Missing details on timeout threshold.')
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce(validParsedReport)
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
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('PARTIAL - Weak recommendations, missing coverage.')
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('PARTIAL - Still weak in edge cases.')
            .mockResolvedValueOnce('PARTIAL - Recommendations need work.')
            .mockResolvedValueOnce('DISAGREE - Multiple issues remain.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.adversarialRetried).toBe(true);
        expect(result.content).toContain('Reviewer notes');
    });

    it('skips adversarial retry when reviewerNotes are too short', async () => {
        mockLlmPrompt.mockResolvedValueOnce(validParsedReport).mockResolvedValueOnce('PARTIAL - ok');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.adversarialRetried).toBeUndefined();
        expect(result.confidence).toBe('medium');
        expect(result.content).toContain('Reviewer notes');
    });

    it('retries when validation fails and eventually succeeds', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('AGREE - Good.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBe(true);
        expect(mockLlmPrompt).toHaveBeenCalledTimes(3);
    });

    it('falls back to main when report returns non-object (null from attemptPrimary)', async () => {
        mockLlmPrompt
            .mockRejectedValueOnce(new Error('Zod validation failed'))
            .mockResolvedValueOnce('fallback content');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toBe('fallback content');
        expect(result.reviewed).toBe(false);
        expect(result.confidence).toBe('medium');
        expect(result.fallbackUsed).toBe(true);
    });

    it('falls back to main when all retries fail validation', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce('fallback content');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toBe('fallback content');
        expect(result.reviewed).toBe(false);
        expect(result.fallbackUsed).toBe(true);
        expect(mockLlmPrompt).toHaveBeenCalledTimes(5);
    });

    it('buildRetryPrompt includes validation errors and invalid response', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('AGREE - Good.');

        await reviewWithLlm('system prompt text', 'user data');
        const retrySystemArg = nonNull(mockLlmPrompt.mock.calls[1])[0].system;
        expect(retrySystemArg).toContain('validation');
        expect(retrySystemArg).toContain(JSON.stringify(invalidParsedReport));
    });

    it('returns fallback when report is non-object and main fails', async () => {
        mockLlmPrompt.mockRejectedValueOnce(new Error('Zod failed')).mockRejectedValueOnce(new Error('Main API error'));

        const result = await reviewWithLlm('system prompt', 'user prompt');
        expect(result.confidence).toBe('medium');
        expect(result.fallbackUsed).toBe(true);
        expect(result.reviewed).toBe(false);
    });

    it('exhausts MAX_RETRIES=3 before falling back', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce('fallback after retries');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.fallbackUsed).toBe(true);
        expect(mockLlmPrompt).toHaveBeenCalledTimes(5);
    });
});
