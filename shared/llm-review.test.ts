vi.mock('./llm-client', () => ({
    llmPrompt: vi.fn(),
    getLlmClientMetrics: vi.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: vi.fn(),
    parseRetryAfter: vi.fn(() => 2000),
}));

vi.mock('./config', () => {
    const mockConfig: Record<string, string> = {};
    return {
        __esModule: true,
        default: {
            get llmReviewBudget() {
                return mockConfig['llmReviewBudget'] ?? '0.50';
            },
            get llmReviewStrategy() {
                return mockConfig['llmReviewStrategy'] ?? 'selective';
            },
            get(key: string) {
                return mockConfig[key] ?? undefined;
            },
            set(key: string, value: string) {
                mockConfig[key] = value;
            },
            reset() {
                Object.keys(mockConfig).forEach((k) => delete mockConfig[k]);
            },
        },
    };
});

import { llmPrompt } from './llm-client.js';
import { reviewWithLlm } from './llm-review.js';
import { nonNull } from './test-utils.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

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
    vi.clearAllMocks();
});

describe('reviewWithLlm', () => {
    it('returns high confidence when reviewer agrees', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('AGREE - The analysis is accurate and complete.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBeTruthy();
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
        expect(result.content).toContain('Self-review');
        expect(result.confidence).toBe('medium');
    });

    it('triggers adversarial retry when reviewerNotes have medium confidence', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('PARTIAL - ok')
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('AGREE - Improved.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.adversarialRetried).toBeTruthy();
        expect(result.content).toContain('ASSERTION');
    });

    it('retries when validation fails and eventually succeeds', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(validParsedReport)
            .mockResolvedValueOnce('AGREE - Good.');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toContain('ASSERTION');
        expect(result.reviewed).toBeTruthy();
        expect(mockLlmPrompt).toHaveBeenCalledTimes(3);
    });

    it('falls back to main when report returns non-object (null from attemptPrimary)', async () => {
        mockLlmPrompt
            .mockRejectedValueOnce(new Error('Zod validation failed'))
            .mockResolvedValueOnce('fallback content');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.content).toBe('fallback content');
        expect(result.reviewed).toBeFalsy();
        expect(result.confidence).toBe('medium');
        expect(result.fallbackUsed).toBeTruthy();
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
        expect(result.reviewed).toBeFalsy();
        expect(result.fallbackUsed).toBeTruthy();
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
        expect(result.fallbackUsed).toBeTruthy();
        expect(result.reviewed).toBeFalsy();
    });

    it('exhausts MAX_RETRIES=3 before falling back', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce(invalidParsedReport)
            .mockResolvedValueOnce('fallback after retries');

        const result = await reviewWithLlm('system prompt', 'user prompt');

        expect(result.fallbackUsed).toBeTruthy();
        expect(mockLlmPrompt).toHaveBeenCalledTimes(5);
    });
});

import Config from './config.js';
import { detectHedging, detectContradictions, shouldSkipAdversarialReview } from './llm-review.js';

const mockReviewResult = (content: string, confidence: 'high' | 'medium' | 'low' = 'medium', notes?: string) => ({
    content,
    reviewed: true,
    confidence,
    ...(notes !== undefined ? { reviewerNotes: notes } : {}),
});

describe('detectHedging', () => {
    it('detects Portuguese hedging patterns', () => {
        const text = 'Parece que isso pode ser um problema. Talvez nao tenha certeza.';

        expect(detectHedging(text)).toBeGreaterThan(0);
    });

    it('returns zero for confident text', () => {
        const text = 'assertion mismatch linha 42';

        expect(detectHedging(text)).toBe(0);
    });

    it('counts multiple hedging markers', () => {
        const text = 'Parece que possivelmente pode ser. Acho que talvez...';

        expect(detectHedging(text)).toBeGreaterThanOrEqual(4);
    });
});

describe('detectContradictions', () => {
    it('detects positive + negative markers in same paragraph', () => {
        const text = 'Resultado correto com erro grave.';

        expect(detectContradictions(text)).toBeGreaterThan(0);
    });

    it('does not flag cross-paragraph contradictions', () => {
        const text = 'Passo 1: tudo certo.\n\nPasso 2: erro encontrado.';

        expect(detectContradictions(text)).toBe(0);
    });

    it('returns zero for consistent text', () => {
        const text = 'Todas as assercoes passaram. Nenhum erro encontrado.';

        expect(detectContradictions(text)).toBe(0);
    });
});

describe('shouldSkipAdversarialReview', () => {
    beforeEach(() => {
        Config.reset();
    });

    it('never skips when strategy is always', () => {
        Config.set('llmReviewStrategy', 'always');
        const result = mockReviewResult('ok', 'low', 'short');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);

        expect(decision.skip).toBeFalsy();
        expect(decision.reason).toBe('strategy_always');
    });

    it('skips when budget is exceeded', () => {
        Config.set('llmReviewBudget', '0.01');
        const result = mockReviewResult('detailed notes here for review', 'medium', 'some notes');
        const decision = shouldSkipAdversarialReview(result, 'test-suite', 0.02);

        expect(decision.skip).toBeTruthy();
        expect(decision.reason).toBe('budget_exceeded');
    });

    it('does not skip when budget is not exceeded', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('detailed notes here for review', 'medium', 'some notes');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0.02);

        expect(decision.skip).toBeFalsy();
    });

    it('skips low-risk artifacts with low confidence', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('ok', 'medium', 'notes');
        const decision = shouldSkipAdversarialReview(result, 'comparison', 0);

        expect(decision.skip).toBeTruthy();
        expect(decision.reason).toBe('low_risk_artifact');
    });

    it('triggers on hedging for non-high confidence', () => {
        Config.set('llmReviewBudget', '1.00');
        const text = 'Parece que talvez possivelmente pode ser que isso esteja certo.';
        const result = mockReviewResult(text, 'low', 'notes');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);

        expect(decision.skip).toBeFalsy();
        expect(decision.reason).toBe('hedging_detected');
    });

    it('triggers on contradiction detection', () => {
        Config.set('llmReviewBudget', '1.00');
        Config.set('llmReviewStrategy', 'selective');
        const text = 'Resultado correto com erro grave.';
        const result = mockReviewResult(text, 'medium', 'notes');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);

        expect(decision.skip).toBeFalsy();
        expect(decision.reason).toBe('contradiction_detected');
    });

    it('skips high-confidence normal risk with short notes', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('ok', 'high', 'short');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);

        expect(decision.skip).toBeTruthy();
        expect(decision.reason).toBe('high_confidence');
    });

    it('escalates critical risk even with high confidence', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('ok', 'high', 'short');
        const decision = shouldSkipAdversarialReview(result, 'test-suite', 0);

        expect(decision.skip).toBeFalsy();
        expect(decision.reason).toBe('critical_risk');
    });

    it('defaults to standard when no specific heuristic triggers', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('Direct statement without hedging.', 'medium', 'notes here');
        const decision = shouldSkipAdversarialReview(result, 'pipeline', 0);

        expect(decision.skip).toBeFalsy();
        expect(decision.reason).toBe('standard');
        expect(decision.maxDepth).toBe(3);
    });
});
