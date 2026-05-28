jest.mock('../shared/llm-client', () => ({
    llmPrompt: jest.fn(),
    clearCache: jest.fn(),
    getLlmClientMetrics: jest.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: jest.fn(),
    parseRetryAfter: jest.fn(() => 2000),
    resetCircuitState: jest.fn(),
    resetRateLimiter: jest.fn(),
}));
jest.mock('../shared/sanitize', () => ({
    sanitizeForLlm: (s: string) => s,
    sanitizeTerminal: (s: string) => s,
    sanitizeHtml: (s: string) => s,
}));

import { llmPrompt } from '../shared/llm-client';
import { reviewWithLlm } from '../shared/llm-review';
import { snapshotLlmMetrics } from '../shared/llm-metrics';
import { clearCache } from '../shared/llm-client';

const mockLlmPrompt = llmPrompt as jest.MockedFunction<typeof llmPrompt>;

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

beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
});

describe('LLM Pipeline E2E', () => {
    it('happy path: report → validation → review → metrics', async () => {
        mockLlmPrompt.mockResolvedValueOnce(validParsedReport).mockResolvedValueOnce('AGREE - Good analysis.');

        const result = await reviewWithLlm('System prompt', 'User request');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBe(true);
        expect(result.confidence).toBe('high');

        const metrics = snapshotLlmMetrics();
        expect(metrics.cacheHits).toBe(0);
    });

    it('retry loop: invalid report → retry → success', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('PARTIAL - Minor issues.');

        const result = await reviewWithLlm('System prompt', 'User request');

        expect(result.reviewed).toBe(true);
        expect(result.confidence).toBe('medium');
        expect(mockLlmPrompt).toHaveBeenCalledTimes(3);
    });

    it('all providers fail: throws error', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('API failure'));

        await expect(reviewWithLlm('System prompt', 'User request')).rejects.toThrow(
            'LLM review and fallback both failed',
        );
    });

    it('validates all elements with multi-element array', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(multiElementParsedReport)
            .mockResolvedValueOnce('AGREE - Both tests look good.');

        const result = await reviewWithLlm('System prompt', 'User request');
        expect(result.content).toContain('Login fails');
        expect(result.content).toContain('Logout fails');
        expect(result.reviewed).toBe(true);
    });

    it('circuit breaker opens during pipeline and triggers fallback', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('HTTP 429 Too Many Requests'));

        await expect(reviewWithLlm('System prompt', 'User request')).rejects.toThrow(
            'LLM review and fallback both failed',
        );
        expect(mockLlmPrompt.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});
