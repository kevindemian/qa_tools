vi.mock('./llm-client', async () => ({
    llmPrompt: vi.fn(),
}));

import { llmPrompt } from './llm-client.js';
import { ArtifactValidator } from './artifact-validator.js';
import { consensusGenerate, refineWithConsistency } from './llm-self-consistency.js';

const mockLlmPrompt = vi.mocked(llmPrompt);

describe('consensusGenerate', () => {
    const validator = new ArtifactValidator('test-suite');
    validator.addInvariant('PASS', () => [
        { passed: true, invariantId: 'PASS', message: 'ok', severity: 'error', artifactPath: '' },
    ]);

    const context = { inputRaw: '', outputRaw: {}, artifactType: 'test-suite' as const };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns consensus when all candidates pass and agree', async () => {
        mockLlmPrompt.mockResolvedValue({ tests: [] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.winner).toBeDefined();
        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('tries all candidates even if some fail validation', async () => {
        mockLlmPrompt.mockResolvedValueOnce(null).mockResolvedValueOnce({ tests: [] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('throws when all candidates fail', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('API error'));

        await expect(
            consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2),
        ).rejects.toThrow();
    });

    it('reports divergence based on structural similarity', async () => {
        mockLlmPrompt
            .mockResolvedValueOnce({ tests: [{ title: 'Test A' }] })
            .mockResolvedValueOnce({ tests: [{ title: 'Test B' }] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.divergence).toBeDefined();
    });

    it('auto-refines when divergence is high and refinement passes validation', async () => {
        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt
            .mockResolvedValueOnce(BIG_OBJ)
            .mockResolvedValueOnce(SMALL_VAL)
            .mockResolvedValueOnce({ tests: [{ title: 'Test Converged' }] });

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.refined).toBe(true);
        expect(mockLlmPrompt).toHaveBeenCalledTimes(3);
    });

    it('falls back to preliminary winner when refinement result fails validation', async () => {
        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt.mockResolvedValueOnce(BIG_OBJ).mockResolvedValueOnce(SMALL_VAL).mockResolvedValueOnce(null);

        validator.addInvariant('REJECT_REFINED', () => [
            { passed: false, invariantId: 'REJECT_REFINED', message: 'reject', severity: 'error', artifactPath: '' },
        ]);

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.refined).toBe(false);
        expect(result.winner).toBeDefined();
    });

    it('falls back to preliminary winner when refinement throws', async () => {
        const BIG_OBJ = { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `field-${i}` })) };
        const SMALL_VAL = { single: 'value' };
        mockLlmPrompt
            .mockResolvedValueOnce(BIG_OBJ)
            .mockResolvedValueOnce(SMALL_VAL)
            .mockRejectedValueOnce(new Error('Refinement API error'));

        const result = await consensusGenerate({ tier: 'fast', system: '', user: '' }, validator, context, 2);

        expect(result.refined).toBe(false);
        expect(result.winner).toBeDefined();
    });
});

describe('refineWithConsistency', () => {
    const validator = new ArtifactValidator('test-suite');
    validator.addInvariant('PASS', () => [
        { passed: true, invariantId: 'PASS', message: 'ok', severity: 'error', artifactPath: '' },
    ]);

    const context = { inputRaw: '', outputRaw: {}, artifactType: 'test-suite' as const };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns refined result when LLM produces valid output', async () => {
        mockLlmPrompt.mockResolvedValue({ tests: [{ title: 'Refined' }] });

        const previousResult = {
            winner: { tests: [{ title: 'Original' }] },
            candidates: [{ tests: [{ title: 'A' }] }, { tests: [{ title: 'B' }] }],
            votes: { 0: 1, 1: 1 },
            divergence: 'high' as const,
            refined: false,
        };

        const result = await refineWithConsistency(
            { tier: 'fast', system: '', user: '' },
            validator,
            context,
            previousResult,
        );

        expect(result.refined).toBe(true);
        expect(result.candidates.length).toBe(1);
    });

    it('falls back to previous result when refined output fails validation', async () => {
        mockLlmPrompt.mockResolvedValue({ tests: [] });

        validator.addInvariant('REJECT', () => [
            { passed: false, invariantId: 'REJECT', message: 'no', severity: 'error', artifactPath: '' },
        ]);

        const previousResult = {
            winner: { tests: [{ title: 'Original' }] },
            candidates: [{ tests: [{ title: 'A' }] }],
            votes: { 0: 1 },
            divergence: 'high' as const,
            refined: false,
        };

        const result = await refineWithConsistency(
            { tier: 'fast', system: '', user: '' },
            validator,
            context,
            previousResult,
        );

        expect(result.refined).toBe(false);
        expect(result.winner).toEqual({ tests: [{ title: 'Original' }] });
    });

    it('falls back to previous result when LLM throws', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('API error'));

        const previousResult = {
            winner: { tests: [{ title: 'Original' }] },
            candidates: [{ tests: [{ title: 'A' }] }],
            votes: { 0: 1 },
            divergence: 'high' as const,
            refined: false,
        };

        const result = await refineWithConsistency(
            { tier: 'fast', system: '', user: '' },
            validator,
            context,
            previousResult,
        );

        expect(result.refined).toBe(false);
        expect(result).toBe(previousResult);
    });
});
