vi.mock('../../shared/llm/llm-client.js', () => ({
    llmPrompt: vi.fn(),
    clearCache: vi.fn(),
    getLlmClientMetrics: vi.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: vi.fn(),
    parseRetryAfter: vi.fn(() => 2000),
    resetCircuitState: vi.fn(),
    resetRateLimiter: vi.fn(),
}));
import { llmPrompt } from '../../shared/llm/llm-client.js';
import { reviewWithLlm } from '../../shared/llm/llm-review.js';
import { snapshotLlmMetrics } from '../../shared/llm/llm-metrics.js';
import { clearCache } from '../../shared/llm/llm-client.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

const validParsedReport = {
    tests: [
        {
            title: 'Login fails',
            classification: 'ASSERTION' as const,
            severity: 'high' as const,
            recommendation: 'Fix assertion logic in login component.',
        },
    ],
};

const multiElementParsedReport = {
    tests: [
        {
            title: 'Login fails',
            classification: 'ASSERTION' as const,
            severity: 'high' as const,
            recommendation: 'Fix assertion logic in login component.',
        },
        {
            title: 'Logout fails',
            classification: 'TIMEOUT' as const,
            severity: 'medium' as const,
            recommendation: 'Increase timeout threshold for logout endpoint.',
        },
    ],
};

const invalidParsedReport = { tests: [{ title: 'Bad' }] };

describe('Llm Pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCache();
    });

    describe('LLM Pipeline E2E', () => {
        it('happy path: report → validation → review → metrics', async () => {
            expect.hasAssertions();

            mockLlmPrompt.mockResolvedValueOnce(validParsedReport).mockResolvedValueOnce('AGREE - Good analysis.');

            const result = await reviewWithLlm('System prompt', 'User request');

            expect(result.content).toContain('ASSERTION');
            expect(result.reviewed).toBeTruthy();
            expect(result.confidence).toBe('high');

            const metrics = snapshotLlmMetrics();

            expect(metrics.cacheHits).toBe(0);
        });

        it('retry loop: invalid report → retry → success with adversarial retry', async () => {
            expect.hasAssertions();

            mockLlmPrompt
                .mockResolvedValueOnce(invalidParsedReport)
                .mockResolvedValueOnce(validParsedReport)
                .mockResolvedValueOnce('PARTIAL - Minor issues.')
                .mockResolvedValueOnce(validParsedReport)
                .mockResolvedValueOnce(validParsedReport)
                .mockResolvedValueOnce(validParsedReport)
                .mockResolvedValueOnce('AGREE - Good.')
                .mockResolvedValueOnce('AGREE - Confirmed.')
                .mockResolvedValueOnce('AGREE - Verified.');

            const result = await reviewWithLlm('System prompt', 'User request');

            expect(result.reviewed).toBeTruthy();
            expect(result.confidence).toBe('high');
            expect(mockLlmPrompt).toHaveBeenCalledTimes(9);
        });

        it('all providers fail: throws error', async () => {
            expect.hasAssertions();

            mockLlmPrompt.mockRejectedValue(new Error('API failure'));

            await expect(reviewWithLlm('System prompt', 'User request')).rejects.toThrow(
                'LLM review and fallback both failed',
            );
        });

        it('validates all elements with multi-element array', async () => {
            expect.hasAssertions();

            mockLlmPrompt
                .mockResolvedValueOnce(multiElementParsedReport)
                .mockResolvedValueOnce('AGREE - Both tests look good.');

            const result = await reviewWithLlm('System prompt', 'User request');

            expect(result.content).toContain('Login fails');
            expect(result.content).toContain('Logout fails');
            expect(result.reviewed).toBeTruthy();
        });

        it('circuit breaker opens during pipeline and triggers fallback', async () => {
            expect.hasAssertions();

            mockLlmPrompt.mockRejectedValue(new Error('HTTP 429 Too Many Requests'));

            await expect(reviewWithLlm('System prompt', 'User request')).rejects.toThrow(
                'LLM review and fallback both failed',
            );
            expect(mockLlmPrompt.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });
});
