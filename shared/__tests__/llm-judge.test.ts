vi.mock('../llm/llm-client.js', () => ({
    llmPrompt: vi.fn(),
}));

vi.mock('../logger');

import { llmPrompt } from '../llm/llm-client.js';
import { rootLogger } from '../logger.js';
import Config from '../config-accessor.js';
import { cohenKappa, cohenKappaFromLabels } from '../quality/llm-judge-calibration.js';
import {
    combineScore,
    judgeSemanticDelta,
    judgeResultToMetrics,
    evaluateWithLlmJudge,
    COMBINE_MAX_DELTA,
} from '../quality/llm-judge.js';
import { CASE18_JUDGE_CRITERIA, BUG_REPORT_JUDGE_CRITERIA } from '../quality/llm-judge.criteria.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

const validJudgeResult = {
    metrics: [
        {
            metricId: 'realism',
            reasoning: 'Steps are concrete and runnable.',
            distribution: [
                { grade: 'Unrealistic', weight: 0 },
                { grade: 'Partially realistic', weight: 0.2 },
                { grade: 'Realistic', weight: 0.8 },
            ],
            flaws: [
                {
                    location: 'Step 2: "Enter password"',
                    reason: 'Omits how the password is entered',
                    expected: 'A concrete input action',
                    fixToMax: 'State "Enter password into the password field"',
                },
            ],
        },
    ],
};

describe('cohenKappa (calibration)', () => {
    it('returns 1.0 for perfect agreement', () => {
        const result = cohenKappa(1, 0.5);
        expect(result.kappa).toBe(1);
    });

    it('returns 0 for chance-level agreement', () => {
        const result = cohenKappa(0.5, 0.5);
        expect(result.kappa).toBe(0);
    });

    it('returns intermediate values for partial agreement', () => {
        const result = cohenKappa(0.8, 0.5);
        expect(result.kappa).toBeCloseTo(0.6, 10);
    });

    it('throws on non-finite input (Rule 24)', () => {
        expect(() => cohenKappa(NaN, 0.5)).toThrow('finite');
        expect(() => cohenKappa(0.5, Infinity)).toThrow('finite');
    });

    it('throws on out-of-range input', () => {
        expect(() => cohenKappa(1.2, 0.5)).toThrow('[0,1]');
        expect(() => cohenKappa(0.5, -0.1)).toThrow('[0,1]');
    });

    it('computes from raw label pairs (perfect)', () => {
        const result = cohenKappaFromLabels(['pass', 'fail', 'pass', 'fail'], ['pass', 'fail', 'pass', 'fail']);
        expect(result).not.toBeNull();
        expect(result?.kappa).toBe(1);
    });

    it('computes from raw label pairs (chance: po === pe)', () => {
        // Observed agreement 0.5 equals expected agreement by chance 0.5 → κ = 0.
        const result = cohenKappaFromLabels(['pass', 'fail', 'pass', 'fail'], ['pass', 'fail', 'fail', 'pass']);
        expect(result).not.toBeNull();
        expect(result?.kappa).toBe(0);
    });

    it('returns null when there is no label variance', () => {
        const result = cohenKappaFromLabels(['pass', 'pass'], ['pass', 'pass']);
        expect(result).toBeNull();
    });

    it('returns -1 for perfect disagreement (po < pe)', () => {
        const result = cohenKappaFromLabels(['pass', 'fail'], ['fail', 'pass']);
        expect(result).not.toBeNull();
        expect(result?.kappa).toBe(-1);
    });

    it('throws on mismatched label arrays (Rule 24)', () => {
        expect(() => cohenKappaFromLabels(['pass'], ['pass', 'fail'])).toThrow('same length');
    });
});

describe('combineScore (floor anchor, ±band)', () => {
    it('keeps the floor when the judge is neutral', () => {
        expect(combineScore(70, 0)).toBe(70);
    });

    it('adjusts up within the band', () => {
        expect(combineScore(70, 6)).toBe(76);
    });

    it('adjusts down within the band', () => {
        expect(combineScore(70, -5)).toBe(65);
    });

    it('clamps to the band and to [0,100]', () => {
        expect(combineScore(95, 20)).toBe(100);
        expect(combineScore(5, -20)).toBe(0);
        expect(combineScore(50, COMBINE_MAX_DELTA + 5)).toBe(60);
    });

    it('throws on non-finite or out-of-range floor (Rule 24)', () => {
        expect(() => combineScore(NaN, 0)).toThrow('finite');
        expect(() => combineScore(101, 0)).toThrow('[0,100]');
        expect(() => combineScore(-1, 0)).toThrow('[0,100]');
    });
});

describe('judgeSemanticDelta and judgeResultToMetrics', () => {
    it('maps a G-Eval distribution to its expected value', () => {
        const metrics = judgeResultToMetrics(validJudgeResult);
        expect(metrics).toHaveLength(1);
        expect(metrics[0]?.score).toBeCloseTo(0.9, 10);
        expect(metrics[0]?.reasoning).toBe(validJudgeResult.metrics[0]?.reasoning);
    });

    it('propagates the judge flaws into the metric report', () => {
        const metrics = judgeResultToMetrics(validJudgeResult);
        expect(metrics[0]?.flaws).toEqual(validJudgeResult.metrics[0]?.flaws);
    });

    it('treats a missing flaws array as empty (defensive)', () => {
        const noFlaws = {
            metrics: [
                {
                    metricId: 'realism',
                    reasoning: 'Steps are concrete and runnable.',
                    distribution: [
                        { grade: 'Unrealistic', weight: 0 },
                        { grade: 'Partially realistic', weight: 0.2 },
                        { grade: 'Realistic', weight: 0.8 },
                    ],
                },
            ],
        };
        const metrics = judgeResultToMetrics(noFlaws as Parameters<typeof judgeResultToMetrics>[0]);
        expect(metrics[0]?.flaws).toEqual([]);
    });

    it('throws on empty metric list (Rule 24)', () => {
        expect(() => judgeResultToMetrics({ metrics: [] })).toThrow('non-empty');
        expect(() => judgeSemanticDelta([])).toThrow('non-empty');
    });

    it('computes a semantic delta bounded by the band', () => {
        const high = judgeSemanticDelta([{ metricId: 'm', reasoning: 'r', score: 1, flaws: [] }]);
        const low = judgeSemanticDelta([{ metricId: 'm', reasoning: 'r', score: 0, flaws: [] }]);
        expect(high).toBeCloseTo(COMBINE_MAX_DELTA, 10);
        expect(low).toBeCloseTo(-COMBINE_MAX_DELTA, 10);
    });
});

describe('evaluateWithLlmJudge (dormant core)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Main (generator) = openai family; reviewer (judge) = google family.
        Config.set('llmModel', 'gpt-4o');
        Config.set('llmReviewApiKey', 'AIza-review');
        Config.set('llmReviewModel', 'gemini-2.0-flash-exp');
        Config.set('llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
    });

    afterEach(() => {
        Config.reset();
    });

    it('returns null when no calibration set (reliability gate, Rule 25)', async () => {
        expect.hasAssertions();
        const result = await evaluateWithLlmJudge({ artifact: 'steps' }, CASE18_JUDGE_CRITERIA.criteria, {
            floor: { score: 70 },
        });
        expect(result).toBeNull();
        expect(mockLlmPrompt).not.toHaveBeenCalled();
    });

    it('returns null when kappa is below threshold', async () => {
        expect.hasAssertions();
        const result = await evaluateWithLlmJudge({ artifact: 'steps' }, CASE18_JUDGE_CRITERIA.criteria, {
            floor: { score: 70 },
            calibrationSet: {
                judgeLabels: ['pass', 'fail'],
                humanLabels: ['fail', 'pass'],
                threshold: 0.6,
            },
        });
        expect(result).toBeNull();
        expect(mockLlmPrompt).not.toHaveBeenCalled();
        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('reliability gate blocked'));
    });

    it('calls the judge when calibration passes', async () => {
        expect.hasAssertions();
        mockLlmPrompt.mockResolvedValue(validJudgeResult);

        const result = await evaluateWithLlmJudge({ artifact: 'steps' }, CASE18_JUDGE_CRITERIA.criteria, {
            floor: { score: 70 },
            calibrationSet: {
                judgeLabels: ['pass', 'fail', 'pass', 'fail'],
                humanLabels: ['pass', 'fail', 'pass', 'fail'],
            },
        });
        expect(result).toEqual(validJudgeResult);
        expect(mockLlmPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                tier: 'reviewer',
                callerId: 'llm-judge',
                schema: expect.anything(),
            }),
        );
    });

    it('returns explicit null when the LLM call fails (Rule 25)', async () => {
        expect.hasAssertions();
        mockLlmPrompt.mockRejectedValue(new Error('LLM API down'));

        const result = await evaluateWithLlmJudge({ artifact: 'steps' }, CASE18_JUDGE_CRITERIA.criteria, {
            floor: { score: 70 },
            calibrationSet: {
                judgeLabels: ['pass', 'fail', 'pass', 'fail'],
                humanLabels: ['pass', 'fail', 'pass', 'fail'],
            },
        });
        expect(result).toBeNull();
        expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('evaluation failed'));
    });

    it('returns null when the judge family equals the generator family (independence gate)', async () => {
        expect.hasAssertions();
        Config.set('llmModel', 'gpt-4o');
        Config.set('llmReviewModel', 'gpt-4o-mini');
        Config.set('llmReviewBaseUrl', 'https://openrouter.ai/api/v1');
        Config.set('llmReviewApiKey', 'sk-review');

        const result = await evaluateWithLlmJudge({ artifact: 'steps' }, CASE18_JUDGE_CRITERIA.criteria, {
            floor: { score: 70 },
            calibrationSet: {
                judgeLabels: ['pass', 'fail', 'pass', 'fail'],
                humanLabels: ['pass', 'fail', 'pass', 'fail'],
            },
        });
        expect(result).toBeNull();
        expect(mockLlmPrompt).not.toHaveBeenCalled();
        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('family-independence gate blocked'));
    });

    it('returns null when the judge family is unknown and LLM_JUDGE_FAMILY is not declared', async () => {
        expect.hasAssertions();
        Config.set('llmModel', 'gpt-4o');
        Config.set('llmReviewModel', 'some-future-judge-xyz');
        Config.set('llmReviewBaseUrl', 'https://openrouter.ai/api/v1');
        Config.set('llmReviewApiKey', 'sk-review');

        const result = await evaluateWithLlmJudge({ artifact: 'steps' }, CASE18_JUDGE_CRITERIA.criteria, {
            floor: { score: 70 },
            calibrationSet: {
                judgeLabels: ['pass', 'fail', 'pass', 'fail'],
                humanLabels: ['pass', 'fail', 'pass', 'fail'],
            },
        });
        expect(result).toBeNull();
        expect(mockLlmPrompt).not.toHaveBeenCalled();
        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('family-independence gate blocked'));
    });

    it('throws when floor is missing (Rule 24)', async () => {
        await expect(
            evaluateWithLlmJudge(
                { artifact: 'steps' },
                CASE18_JUDGE_CRITERIA.criteria,
                {} as Parameters<typeof evaluateWithLlmJudge>[2],
            ),
        ).rejects.toThrow('floor is required');
    });
});

describe('judge criteria registry (anti-echo)', () => {
    it('bug-report criteria are defined (no deterministic bug floor exists)', () => {
        expect(BUG_REPORT_JUDGE_CRITERIA.featureId).toBe('bug-report');
        expect(BUG_REPORT_JUDGE_CRITERIA.criteria.length).toBeGreaterThan(0);
    });

    it('criteria axes are semantic, not structural (complement the floor)', () => {
        for (const c of CASE18_JUDGE_CRITERIA.criteria) {
            expect(c.axis).toMatch(/realis|distinct|boundary|semantic|insight/i);
        }
    });
});
