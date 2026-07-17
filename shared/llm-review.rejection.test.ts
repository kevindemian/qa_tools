import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

vi.mock('./llm-client.js', () => ({
    llmPrompt: vi.fn(),
}));

import { llmPrompt } from './llm-client.js';
import { reviewWithLlm } from './llm-review.js';
import * as llmMetrics from './llm-metrics.js';
import Config from './config-accessor.js';

const VALID_ANALYSIS = {
    tests: [
        {
            title: 'login fails on empty password',
            classification: 'ASSERTION',
            severity: 'high',
            recommendation: 'add a guard for empty password input',
        },
    ],
};

const INVALID_ANALYSIS = { notAValidField: true };

const mockLlmPrompt = vi.mocked(llmPrompt);

describe('ReviewWithLlm — rejection branches (LLM is the only mocked boundary)', () => {
    let failureSpy: MockInstance;
    let rejectedSpy: MockInstance;
    let approvedSpy: MockInstance;

    beforeEach(() => {
        failureSpy = vi.spyOn(llmMetrics, 'recordLlmFailure').mockImplementation(() => undefined);
        rejectedSpy = vi.spyOn(llmMetrics, 'recordArtifactRejected').mockImplementation(() => undefined);
        approvedSpy = vi.spyOn(llmMetrics, 'recordArtifactApproved').mockImplementation(() => undefined);
        Config.reset();
    });

    afterEach(() => {
        failureSpy.mockRestore();
        rejectedSpy.mockRestore();
        approvedSpy.mockRestore();
        mockLlmPrompt.mockReset();
        Config.reset();
    });

    it('records a failure and falls back when the retry LLM call throws (runRetryLoop catch, §25 explicit)', async () => {
        expect.assertions(4);

        mockLlmPrompt
            .mockResolvedValueOnce(INVALID_ANALYSIS) // primary: fails all 3 layers
            .mockRejectedValueOnce(new Error('LLM timeout on retry')) // retry: throws
            .mockResolvedValueOnce('fallback content'); // callLlmFallback

        const result = await reviewWithLlm('system', 'user', 'analysis');

        expect(failureSpy).toHaveBeenCalledWith(expect.anything());
        expect(result.fallbackUsed).toBeTruthy();
        expect(result.reviewed).toBeFalsy();
        expect(rejectedSpy).toHaveBeenCalledWith();
    });

    it('rejects (recordArtifactRejected) when self-review confidence is LOW', async () => {
        expect.assertions(3);

        mockLlmPrompt
            .mockResolvedValueOnce(VALID_ANALYSIS) // primary: passes all 3 layers
            .mockResolvedValueOnce('DISAGREE — major errors remain in the analysis'); // self-review → low

        const result = await reviewWithLlm('system', 'user', 'analysis');

        expect(result.confidence).toBe('low');
        expect(rejectedSpy).toHaveBeenCalledWith();
        expect(approvedSpy).not.toHaveBeenCalledWith();
    });

    it('rejects (recordArtifactRejected) when adversarial escalation returns a non-high confidence (branch 433)', async () => {
        expect.assertions(3);

        Config.set('llmReviewStrategy', 'always');

        mockLlmPrompt
            .mockResolvedValueOnce(VALID_ANALYSIS) // primary: passes all 3 layers
            .mockResolvedValueOnce('PARTIAL — minor issues remain in the analysis') // self-review → medium
            // adversarialRetryParallel: ADVERSARIAL_TIERS (report, fast, fallback) — all valid
            .mockResolvedValueOnce(VALID_ANALYSIS)
            .mockResolvedValueOnce(VALID_ANALYSIS)
            .mockResolvedValueOnce(VALID_ANALYSIS)
            // reReviewParallel: re-review verdict PARTIAL → medium (non-high)
            .mockResolvedValueOnce('PARTIAL — acceptable after fixes');

        const result = await reviewWithLlm('system', 'user', 'analysis');

        expect(result.adversarialRetried).toBeTruthy();
        expect(rejectedSpy).toHaveBeenCalledWith();
        expect(result.confidence).not.toBe('high');
    });
});
