jest.mock('./config', () => {
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

import Config from './config';
import { estimateCostUSD, getModelPricing, hasPricingForModel } from './llm-fallback-config';
import { detectHedging, detectContradictions, shouldSkipAdversarialReview } from './llm-review';

const mockReviewResult = (content: string, confidence: 'high' | 'medium' | 'low' = 'medium', notes?: string) => ({
    content,
    reviewed: true,
    confidence,
    ...(notes !== undefined ? { reviewerNotes: notes } : {}),
});

describe('estimateCostUSD', () => {
    it('calculates cost for known model', () => {
        const cost = estimateCostUSD('google/gemini-2.0-flash-exp', 1000, 500);
        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeLessThan(0.01);
    });

    it('falls back to default pricing for unknown model', () => {
        const cost = estimateCostUSD('nonexistent-model', 1000, 500);
        expect(cost).toBeGreaterThan(0);
    });

    it('handles zero tokens', () => {
        const cost = estimateCostUSD('google/gemini-2.0-flash-exp', 0, 0);
        expect(cost).toBe(0);
    });

    it('pricing is proportional to token count', () => {
        const small = estimateCostUSD('google/gemini-2.0-flash-exp', 1000, 500);
        const large = estimateCostUSD('google/gemini-2.0-flash-exp', 2000, 1000);
        expect(large).toBeCloseTo(small * 2, 5);
    });
});

describe('getModelPricing', () => {
    it('returns pricing for known model', () => {
        const pricing = getModelPricing('google/gemini-2.0-flash-exp');
        expect(pricing).toBeDefined();
        if (!pricing) throw new Error('Expected pricing to be defined');
        expect(pricing.inputPer1K).toBeGreaterThan(0);
        expect(pricing.outputPer1K).toBeGreaterThan(0);
    });

    it('returns undefined for unknown model', () => {
        expect(getModelPricing('unknown')).toBeUndefined();
    });
});

describe('hasPricingForModel', () => {
    it('returns true for known model', () => {
        expect(hasPricingForModel('google/gemini-2.0-flash-exp')).toBe(true);
    });

    it('returns false for unknown model', () => {
        expect(hasPricingForModel('unknown')).toBe(false);
    });

    it('returns true for llama-3.1-8b-instant', () => {
        expect(hasPricingForModel('llama-3.1-8b-instant')).toBe(true);
    });
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
        expect(decision.skip).toBe(false);
        expect(decision.reason).toBe('strategy_always');
    });

    it('skips when budget is exceeded', () => {
        Config.set('llmReviewBudget', '0.01');
        const result = mockReviewResult('detailed notes here for review', 'medium', 'some notes');
        const decision = shouldSkipAdversarialReview(result, 'test-suite', 0.02);
        expect(decision.skip).toBe(true);
        expect(decision.reason).toBe('budget_exceeded');
    });

    it('does not skip when budget is not exceeded', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('detailed notes here for review', 'medium', 'some notes');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0.02);
        expect(decision.skip).toBe(false);
    });

    it('skips low-risk artifacts with low confidence', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('ok', 'medium', 'notes');
        const decision = shouldSkipAdversarialReview(result, 'comparison', 0);
        expect(decision.skip).toBe(true);
        expect(decision.reason).toBe('low_risk_artifact');
    });

    it('triggers on hedging for non-high confidence', () => {
        Config.set('llmReviewBudget', '1.00');
        const text = 'Parece que talvez possivelmente pode ser que isso esteja certo.';
        const result = mockReviewResult(text, 'low', 'notes');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);
        expect(decision.skip).toBe(false);
        expect(decision.reason).toBe('hedging_detected');
    });

    it('triggers on contradiction detection', () => {
        Config.set('llmReviewBudget', '1.00');
        Config.set('llmReviewStrategy', 'selective');
        const text = 'Resultado correto com erro grave.';
        const result = mockReviewResult(text, 'medium', 'notes');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);
        expect(decision.skip).toBe(false);
        expect(decision.reason).toBe('contradiction_detected');
    });

    it('skips high-confidence normal risk with short notes', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('ok', 'high', 'short');
        const decision = shouldSkipAdversarialReview(result, 'analysis', 0);
        expect(decision.skip).toBe(true);
        expect(decision.reason).toBe('high_confidence');
    });

    it('escalates critical risk even with high confidence', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('ok', 'high', 'short');
        const decision = shouldSkipAdversarialReview(result, 'test-suite', 0);
        expect(decision.skip).toBe(false);
        expect(decision.reason).toBe('critical_risk');
    });

    it('defaults to standard when no specific heuristic triggers', () => {
        Config.set('llmReviewBudget', '1.00');
        const result = mockReviewResult('Direct statement without hedging.', 'medium', 'notes here');
        const decision = shouldSkipAdversarialReview(result, 'pipeline', 0);
        expect(decision.skip).toBe(false);
        expect(decision.reason).toBe('standard');
        expect(decision.maxDepth).toBe(3);
    });
});
